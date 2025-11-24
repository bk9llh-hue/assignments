import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// --- Smart Catch-All Loader ---
app.get("/:targetUrl(*)", async (req, res) => {
  try {
    let encodedUrl = req.params.targetUrl; // catch-all parameter
    if (!encodedUrl) {
      return res.sendFile(path.join(__dirname, "home.html"));
    }

    encodedUrl = decodeURIComponent(encodedUrl);

    // Prepend https:// if missing
    let targetUrl = encodedUrl.match(/^https?:\/\//) ? encodedUrl : "https://" + encodedUrl;

    // Append query string if exists
    if (Object.keys(req.query).length > 0) {
      const qs = new URLSearchParams(req.query).toString();
      targetUrl += "?" + qs;
    }

    console.log("Fetching:", targetUrl);

    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await upstream.text();

      // Rewrite relative URLs to loader
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

    // Non-HTML: return as-is
    const buffer = await upstream.arrayBuffer();
    res.set("Content-Type", contentType);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Loader Error:", err);
    res.status(500).send("Upstream error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`Smart loader running at http://localhost:${PORT}`));
