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

// --- Enable compression ---
app.use(compression());

// --- CORS headers ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// --- Serve static files with cache headers ---
app.use(
  express.static(__dirname, {
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      res.set("Cache-Control", "public, max-age=86400");
    },
  })
);

// --- LRU cache for HTML and small assets ---
const htmlCache = new LRU({
  max: 50,
  ttl: 1000 * 60 * 5, // 5 minutes
});

// --- Disk cache folder ---
const diskCacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(diskCacheDir)) fs.mkdirSync(diskCacheDir);

// --- robots.txt fallback ---
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nDisallow:");
});

// --- Root route serves home.html ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

// --- Helper to get cached file path ---
function getDiskCachePath(url) {
  return path.join(diskCacheDir, encodeURIComponent(url));
}

// --- Smart catch-all loader ---
app.get("/:targetUrl(.*)", async (req, res) => {
  try {
    let encodedUrl = decodeURIComponent(req.params.targetUrl);
    if (!encodedUrl) return res.sendFile(path.join(__dirname, "home.html"));

    let targetUrl = /^https?:\/\//i.test(encodedUrl)
      ? encodedUrl
      : "https://" + encodedUrl;

    if (Object.keys(req.query).length > 0) {
      const qs = new URLSearchParams(req.query).toString();
      targetUrl += "?" + qs;
    }

    const diskCacheFile = getDiskCachePath(targetUrl);

    // --- Check in-memory cache ---
    if (htmlCache.has(targetUrl)) {
      console.log("[Cache-Memory] Hit:", targetUrl);
      res.set("Content-Type", "text/html");
      return res.send(htmlCache.get(targetUrl));
    }

    // --- Check disk cache ---
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
      res.set("Content-Type", mimeType);
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
      const transformStream = new (require("stream").Transform)({
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

      // Cache HTML in memory
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
