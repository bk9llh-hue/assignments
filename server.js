import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Serve static files in project root ---
app.use(express.static(__dirname));

// --- Root route serves home.html ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

// --- Smart Catch-All Loader ---
// Fixed: Express 5 syntax (.*)
app.get("/:targetUrl(.*)", async (req, res) => {
  try {
    let encodedUrl = req.params.targetUrl;

    if (!encodedUrl) {
      // Fallback to home.html
      return res.sendFile(path.join(__dirname, "home.html"));
    }

    encodedUrl = decodeURIComponent(encodedUrl);

    // Ensure proper protocol
    let targetUrl = /^https?:\/\//i.test(encodedUrl)
      ? encodedUrl
      : "https://" + encodedUrl;

    // Append query string if any
    if (Object.keys(req.query).length > 0) {
      const qs = new URLSearchParams(req.query).toString();
      targetUrl += "?" + qs;
    }

    console.log("[Smart Loader] Fetching:", targetUrl);

    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await upstream.text();

      // Rewrite relative URLs to loader proxy
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

    // Non-HTML content
    const buffer = await upstream.arrayBuffer();
    res.set("Content-Type", contentType);
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("[Smart Loader] Error:", err);
    res.status(500).send("Upstream error: " + err.message);
  }
});

// --- Start server ---
app.listen(PORT, () =>
  console.log(`Smart loader running at http://localhost:${PORT}`)
);
