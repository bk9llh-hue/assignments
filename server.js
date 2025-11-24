import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";
import compression from "compression";
import LRU from "lru-cache";
import fs from "fs";
import { pipeline } from "stream";
import { promisify } from "util";

const pipe = promisify(pipeline);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Config ---
const DISK_CACHE_DIR = path.join(__dirname, "cache");
const DISK_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const DISK_CACHE_MAX_SIZE = 1024 * 1024 * 1024; // 1GB max

if (!fs.existsSync(DISK_CACHE_DIR)) fs.mkdirSync(DISK_CACHE_DIR);

// --- Compression ---
app.use(compression());

// --- CORS ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// --- Static files ---
app.use(
  express.static(__dirname, {
    maxAge: "1d",
    setHeaders: (res) => res.set("Cache-Control", "public, max-age=86400"),
  })
);

// --- LRU for HTML ---
const htmlCache = new LRU({ max: 50, ttl: 1000 * 60 * 5 });

// --- robots.txt ---
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nDisallow:");
});

// --- Root route ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

// --- Disk cache helpers ---
function getDiskCachePath(url) {
  return path.join(DISK_CACHE_DIR, encodeURIComponent(url));
}

// Cleanup old files
async function cleanupDiskCache() {
  try {
    const files = fs.readdirSync(DISK_CACHE_DIR);
    const now = Date.now();
    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(DISK_CACHE_DIR, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;

      // Remove files older than TTL
      if (now - stats.mtimeMs > DISK_CACHE_TTL) {
        fs.unlinkSync(filePath);
        totalSize -= stats.size;
        console.log("[Cache-Cleanup] Removed old file:", file);
      }
    }

    // If total size exceeds max, delete oldest files
    if (totalSize > DISK_CACHE_MAX_SIZE) {
      const sorted = files
        .map((f) => ({
          file: f,
          mtime: fs.statSync(path.join(DISK_CACHE_DIR, f)).mtimeMs,
          size: fs.statSync(path.join(DISK_CACHE_DIR, f)).size,
        }))
        .sort((a, b) => a.mtime - b.mtime);

      for (const f of sorted) {
        fs.unlinkSync(path.join(DISK_CACHE_DIR, f.file));
        totalSize -= f.size;
        console.log("[Cache-Cleanup] Removed oldest file:", f.file);
        if (totalSize <= DISK_CACHE_MAX_SIZE) break;
      }
    }
  } catch (err) {
    console.error("[Cache-Cleanup] Error:", err);
  }
}

// Run cleanup every hour
setInterval(cleanupDiskCache, 1000 * 60 * 60);

// --- Catch-all loader ---
app.get("/:targetUrl(.*)", async (req, res) => {
  try {
    const encodedUrl = decodeURIComponent(req.params.targetUrl);
    if (!encodedUrl) return res.sendFile(path.join(__dirname, "home.html"));

    let targetUrl = /^https?:\/\//i.test(encodedUrl)
      ? encodedUrl
      : "https://" + encodedUrl;

    if (Object.keys(req.query).length > 0) {
      targetUrl += "?" + new URLSearchParams(req.query).toString();
    }

    const diskCacheFile = getDiskCachePath(targetUrl);

    // --- Memory cache ---
    if (htmlCache.has(targetUrl)) {
      console.log("[Cache-Memory] Hit:", targetUrl);
      res.set("Content-Type", "text/html");
      return res.send(htmlCache.get(targetUrl));
    }

    // --- Disk cache ---
    if (fs.existsSync(diskCacheFile)) {
      console.log("[Cache-Disk] Hit:", targetUrl);
      const stat = fs.statSync(diskCacheFile);
      res.set("Content-Length", stat.size);
      const ext = path.extname(diskCacheFile).toLowerCase();
      const mimeType = ext.match(/\.css$/i)
        ? "text/css"
        : ext.match(/\.js$/i)
        ? "application/javascript"
        : ext.match(/\.(png|jpg|jpeg|gif|svg)$/i)
        ? "image/" + ext.replace(".", "")
        : "application/octet-stream";
      return fs.createReadStream(diskCacheFile).pipe(res);
    }

    // --- Fetch upstream ---
    console.log("[Fetch] Loading:", targetUrl);
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      res.set("Content-Type", "text/html");

      let fullHtml = "";
      const Transform = require("stream").Transform;
      const transformStream = new Transform({
        transform(chunk, encoding, callback) {
          let html = chunk.toString();

          html = html.replace(
            /(href|src|action)=["'](?!https?:|\/\/)([^"']+)["']/gi,
            (match, attr, url) => {
              try {
                const absolute = new URL(url, targetUrl).href;
                return `${attr}="/${encodeURIComponent(absolute)}"`;
              } catch {
                return match;
              }
            }
          );

          html = html.replace(
            /<a\s+[^>]*href=["'](?!https?:|\/\/)([^"']+)["']/gi,
            (match, url) => {
              try {
                const absolute = new URL(url, targetUrl).href;
                return match.replace(url, "/" + encodeURIComponent(absolute));
              } catch {
                return match;
              }
            }
          );

          fullHtml += html;
          this.push(html);
          callback();
        },
      });

      upstream.body.pipe(transformStream).pipe(res);
      upstream.body.on("end", () => htmlCache.set(targetUrl, fullHtml));
      return;
    }

    // --- Non-HTML assets: cache to disk ---
    res.set("Content-Type", contentType);
    await pipe(upstream.body, fs.createWriteStream(diskCacheFile), res);
  } catch (err) {
    console.error("[Loader] Error:", err);
    res.status(500).send("Upstream error: " + err.message);
  }
});

// --- Start server ---
app.listen(PORT, () =>
  console.log(`Smart loader running at http://localhost:${PORT}`)
);
