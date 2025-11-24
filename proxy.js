import express from "express";
import fetch, { Headers } from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Helper: force proxify URLs
const proxify = (url) => "/" + encodeURIComponent(url);

// Smart HTML Rewriter
function rewriteHTML(html, baseUrl) {
  return html
    // src="something"
    .replace(/(src|href|action)=["']([^"']+)["']/gi, (m, attr, url) => {
      try {
        const abs = new URL(url, baseUrl).href;
        return `${attr}="${proxify(abs)}"`;
      } catch {
        return m;
      }
    })
    // CSS url(...)
    .replace(/url\(([^)]+)\)/gi, (m, url) => {
      const clean = url.replace(/["']/g, "");
      if (clean.startsWith("data:")) return m;

      try {
        const abs = new URL(clean, baseUrl).href;
        return `url("${proxify(abs)}")`;
      } catch {
        return m;
      }
    });
}

// Remove headers that break iframe / proxy
const stripSecurity = (res) => {
  res.removeHeader("content-security-policy");
  res.removeHeader("strict-transport-security");
  res.removeHeader("x-frame-options");
  res.removeHeader("x-content-type-options");
  res.removeHeader("x-xss-protection");
  res.removeHeader("referrer-policy");
};

// MAIN SMART PROXY
app.get("/:url(*)", async (req, res) => {
  let raw = req.params.url;

  // Home
  if (!raw) return res.sendFile(path.join(__dirname, "home.html"));

  // Decode URL
  let targetUrl = decodeURIComponent(raw);

  if (!targetUrl.match(/^https?:\/\//)) {
    targetUrl = "https://" + targetUrl;
  }

  // Reconstruct querystring
  if (Object.keys(req.query).length) {
    const qs = new URLSearchParams(req.query).toString();
    targetUrl += "?" + qs;
  }

  console.log("FETCH →", targetUrl);

  try {
    const upstream = await fetch(targetUrl, {
      redirect: "manual",
      headers: {
        "User-Agent": req.headers["user-agent"],
        Accept: "*/*",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });

    // Handle redirects by proxifying Location header
    if (upstream.status >= 300 && upstream.status < 400) {
      const loc = upstream.headers.get("location");
      if (loc) {
        const abs = new URL(loc, targetUrl).href;
        return res.redirect(proxify(abs));
      }
    }

    // Copy headers but remove limits
    upstream.headers.forEach((v, k) => {
      if (!["content-security-policy", "x-frame-options"].includes(k)) {
        res.setHeader(k, v);
      }
    });

    stripSecurity(res);

    // STREAM, not buffer
    const encoding = upstream.headers.get("content-encoding");
    const contentType = upstream.headers.get("content-type") || "";

    let stream = upstream.body;

    if (encoding === "gzip") stream = stream.pipe(zlib.createGunzip());
    if (encoding === "br") stream = stream.pipe(zlib.createBrotliDecompress());
    if (encoding === "deflate")
      stream = stream.pipe(zlib.createInflate());

    // HTML gets rewritten smartly
    if (contentType.includes("text/html")) {
      let html = "";
      stream.on("data", (chunk) => (html += chunk.toString()));
      stream.on("end", () => {
        const finalHTML = rewriteHTML(html, targetUrl);
        res.setHeader("content-type", "text/html");
        res.send(finalHTML);
      });
      return;
    }

    // Everything else → stream as-is
    stream.pipe(res);
  } catch (err) {
    console.log("Proxy error:", err);
    res.status(500).send("Proxy Failure: " + err.message);
  }
});

app.listen(PORT, () =>
  console.log(`SMART SCRAMJET PROXY RUNNING → http://localhost:${PORT}`)
);
