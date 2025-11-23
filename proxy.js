// proxy.js
import express from "express";
import fetch from "node-fetch";
import { URL } from "url";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (home.html, browser.html, etc.)
app.use(express.static("."));

// --- Smart Proxy Handler ---
app.get("/:encodedUrl(*)?", async (req, res) => {
  try {
    // If no URL provided, serve blank home page
    if (!req.params.encodedUrl) {
      return res.sendFile(path.resolve("home.html"));
    }

    // Decode the full path, including query params
    const decodedPath = decodeURIComponent(req.params.encodedUrl);

    // Add https:// if missing
    let targetUrl = decodedPath.match(/^https?:\/\//) ? decodedPath : `https://${decodedPath}`;

    // Fetch the target website
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Accept": "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";

    // Handle HTML content with relative URL rewriting
    if (contentType.includes("text/html")) {
      let html = await upstream.text();

      // Rewrite relative href/src URLs to proxy paths
      html = html.replace(
        /(href|src)=["'](?!https?:|\/\/)([^"']+)["']/gi,
        (match, attr, url) => {
          try {
            const absolute = new URL(url, targetUrl).href;
            return `${attr}="/${encodeURIComponent(absolute)}"`;
          } catch {
            return match;
          }
        }
      );

      res.set("Content-Type", "text/html");
      return res.send(html);
    }

    // Non-HTML content (images, JS, CSS, etc.)
    const buffer = await upstream.arrayBuffer();
    res.set("Content-Type", contentType);
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error("Proxy Error:", err);
    return res.status(500).send("Upstream error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`Smart proxy running at http://localhost:${PORT}`));
