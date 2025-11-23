// proxy.js
import express from "express";
import fetch from "node-fetch";
import { URL } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (home.html, browser.html, etc.)
app.use(express.static("."));

// --- Proxy Handler ---
app.get("/:encodedUrl(*)", async (req, res) => {
  try {
    const encodedUrl = req.params.encodedUrl;
    if (!encodedUrl) return res.sendFile("home.html", { root: "." });

    // Decode URL
    let target = decodeURIComponent(encodedUrl);

    // Auto prepend https:// if missing
    if (!target.startsWith("http")) target = "https://" + target;

    // Fetch the target website
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Accept": "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";

    // If it's HTML, we can optionally rewrite relative URLs minimally
    if (contentType.includes("text/html")) {
      let text = await upstream.text();

      // Minimal rewriting of relative URLs to go through our proxy
      text = text.replace(
        /(href|src)=["'](?!https?:|\/\/)([^"']+)["']/g,
        (match, attr, url) => {
          try {
            const absolute = new URL(url, target).href;
            return `${attr}="/${encodeURIComponent(absolute)}"`;
          } catch {
            return match;
          }
        }
      );

      // Send HTML as-is
      res.set("Content-Type", "text/html");
      return res.send(text);
    }

    // For other content types (JS, CSS, images, JSON, etc.)
    const buffer = await upstream.arrayBuffer();
    res.set("Content-Type", contentType);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Proxy Error:", err);
    return res.status(500).send("Proxy Error: " + err.message);
  }
});

// Start server
app.listen(PORT, () => console.log(`Smart proxy running on http://localhost:${PORT}`));
