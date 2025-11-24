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

// --- Smart loader ---
app.get("/*", async (req, res) => {
  try {
    let encoded = req.path.slice(1); // remove leading slash
    if (!encoded) return res.sendFile(path.join(__dirname, "home.html"));

    encoded = decodeURIComponent(encoded);
    let target = /^https?:\/\//.test(encoded) ? encoded : "https://" + encoded;

    // Append query string if exists
    if (Object.keys(req.query).length > 0) {
      const qs = new URLSearchParams(req.query).toString();
      target += "?" + qs;
    }

    console.log("Loading:", target);

    const upstream = await fetch(target, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
      },
    });

    const type = upstream.headers.get("content-type") || "";

    if (type.includes("text/html")) {
      let html = await upstream.text();

      // Rewrite relative URLs
      html = html.replace(
        /(href|src)=["'](?!https?:|\/\/)([^"']+)["']/gi,
        (match, attr, url) => {
          try {
            const abs = new URL(url, target).href;
            return `${attr}="/${encodeURIComponent(abs)}"`;
          } catch {
            return match;
          }
        }
      );

      res.set("Content-Type", "text/html");
      return res.send(html);
    }

    // Non-HTML: stream as-is
    const buffer = await upstream.arrayBuffer();
    res.set("Content-Type", type);
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error("Error loading site:", err);
    res.status(500).send("Upstream error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`Smart loader running at http://localhost:${PORT}`));
