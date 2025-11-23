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

// --- Smart Proxy Handler ---
app.get("/*", async (req, res) => {
  try {
    // Get everything after the / including query string
    let encodedUrl = req.originalUrl.slice(1); 
    if (!encodedUrl) return res.sendFile(path.join(__dirname, "home.html"));

    encodedUrl = decodeURIComponent(encodedUrl);

    // Prepend https:// if missing
    let targetUrl = encodedUrl.match(/^https?:\/\//) ? encodedUrl : "https://" + encodedUrl;

    console.log("Fetching:", targetUrl);

    // Fetch upstream content
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
      },
      redirect: "follow", // follow redirects
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream returned status ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") || "";

    // HTML content: rewrite links
    if (contentType.includes("text/html")) {
      let html = await upstream.text();

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

    // Non-HTML content: stream
    const buffer = await upstream.arrayBuffer();
    res.set("Content-Type", contentType);
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error("Proxy Error:", err);

    if (err.code === "ENOTFOUND") {
      return res.status(404).send("Website not found");
    }
    res.status(500).send("Upstream error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`Smart proxy running at http://localhost:${PORT}`));
