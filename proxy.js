// proxy.js
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { URL } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (home.html, browser.html, etc.)
app.use(express.static("."));

// --- Smart Proxy Handler ---
app.get("/:encodedUrl(*)", async (req, res) => {
  try {
    const encodedUrl = req.params.encodedUrl;
    if (!encodedUrl) {
      // Blank home page
      return res.sendFile(path.resolve("home.html"));
    }

    // Decode the URL properly
    let targetUrl = decodeURIComponent(encodedUrl);

    // Prepend https:// if missing
    if (!targetUrl.match(/^https?:\/\//)) targetUrl = "https://" + targetUrl;

    // Append query string if present
    if (req.originalUrl.includes("?")) {
      const qs = req.originalUrl.split("?").slice(1).join("?");
      targetUrl += "?" + qs;
    }

    console.log("Fetching:", targetUrl);

    // Fetch upstream content
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Accept": "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";

    // HTML content: rewrite relative URLs
    if (contentType.includes("text/html")) {
      let html = await upstream.text();

      // Fix relative href/src URLs
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

    // Non-HTML content: return as-is
    const buffer = await upstream.arrayBuffer();
    res.set("Content-Type", contentType);
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error("Proxy Error:", err);
    return res.status(500).send("Upstream error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`Smart proxy running at http://localhost:${PORT}`));
