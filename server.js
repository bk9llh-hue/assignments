import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";
import compression from "compression";
import LRU from "lru-cache"; // caching

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Enable compression for faster transfer ---
app.use(compression());

// --- Serve static files with cache headers ---
app.use(
  express.static(__dirname, {
    maxAge: "1d", // 24h cache
    setHeaders: (res, filePath) => {
      res.set("Cache-Control", "public, max-age=86400");
    },
  })
);

// --- LRU cache for HTML pages ---
const htmlCache = new LRU({
  max: 50, // max 50 pages in memory
  ttl: 1000 * 60 * 5, // 5 minutes
});

// --- Root route serves home.html ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

// --- Optimized catch-all loader ---
app.get("/:targetUrl(.*)", async (req, res) => {
  try {
    let encodedUrl = req.params.targetUrl;

    if (!encodedUrl) {
      return res.sendFile(path.join(__dirname, "home.html"));
    }

    encodedUrl = decodeURIComponent(encodedUrl);

    let targetUrl = /^https?:\/\//i.test(encodedUrl)
      ? encodedUrl
      : "https://" + encodedUrl;

    if (Object.keys(req.query).length > 0) {
      const qs = new URLSearchParams(req.query).toString();
      targetUrl += "?" + qs;
    }

    // --- Check cache first ---
    if (htmlCache.has(targetUrl)) {
      console.log("[Cache] Hit:", targetUrl);
      const cachedHtml = htmlCache.get(targetUrl);
      res.set("Content-Type", "text/html");
      return res.send(cachedHtml);
    }

    console.log("[Fetch] Loading:", targetUrl);

    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await upstream.text();

      // --- Smart HTML rewriting ---
      // Rewrite href/src/a/link/script to route through proxy
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

      // Optional: rewrite <a> tags to pass through proxy
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

      // Store in cache
      htmlCache.set(targetUrl, html);

      res.set("Content-Type", "text/html");
      return res.send(html);
    }

    // --- Non-HTML content: stream to client ---
    res.set("Content-Type", contentType);
    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("[Loader] Error:", err);
    res.status(500).send("Upstream error: " + err.message);
  }
});

// --- Start server ---
app.listen(PORT, () =>
  console.log(`Smart loader running at http://localhost:${PORT}`)
);
