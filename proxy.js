import express from "express";
import fetch, { Headers } from "node-fetch";
import { URL } from "url";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Allow large bodies
app.use(express.raw({ type: "*/*", limit: "50mb" }));

// Serve static files (home.html, UI, etc)
app.use(express.static(__dirname));

//
// ========================
//  SMART REWRITE FUNCTION
// ========================
// Handles HTML, JS, CSS, inline scripts, ajax URLs, action=, fetch(), import(), etc.
//
function rewriteContent(body, baseUrl) {
  if (!body) return body;

  const base = new URL(baseUrl);

  const encode = url => `/${encodeURIComponent(url)}`;

  // --- HTML attributes: href, src, action
  body = body.replace(
    /(href|src|action)=["'](?!data:|mailto:|javascript:|#)([^"']+)["']/gi,
    (_, attr, url) => {
      try {
        const abs = new URL(url, base).href;
        return `${attr}="${encode(abs)}"`;
      } catch {
        return _;
      }
    }
  );

  // --- CSS url(...)
  body = body.replace(
    /url\(["']?(?!data:|#|javascript)([^"')]+)["']?\)/gi,
    (_, url) => {
      try {
        const abs = new URL(url, base).href;
        return `url("${encode(abs)}")`;
      } catch {
        return _;
      }
    }
  );

  // --- JS: fetch("/something")
  body = body.replace(
    /fetch\(["'](?!https?:)([^"']+)["']\)/gi,
    (_, url) => `fetch("${encode(new URL(url, base).href)}")`
  );

  // --- JS: new WebSocket("wss://...")
  body = body.replace(
    /new WebSocket\(["']([^"']+)["']\)/gi,
    (_, ws) => `new WebSocket("${encode(ws)}")`
  );

  // --- SPA navigation (pushState)
  body = body.replace(
    /history\.pushState\(([^)]*)\)/gi,
    match => `/* proxied */ ${match}`
  );

  return body;
}

//
// ========================
//  PROXY REQUEST HANDLER
// ========================
// This handles GET, POST, PUT, DELETE, HEAD, etc.
// It also handles binary files, html, json, scripts, css, etc.
//
app.all("*", async (req, res) => {
  try {
    // Home page
    if (req.path === "/") {
      return res.sendFile(path.join(__dirname, "home.html"));
    }

    // Decode proxied URL
    let encoded = req.path.slice(1);
    let targetUrl = decodeURIComponent(encoded);

    // Add https:// if missing
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    // Append query params
    const qs = new URLSearchParams(req.query).toString();
    if (qs) targetUrl += "?" + qs;

    console.log("→ Upstream:", targetUrl);

    // Prepare upstream headers
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === "host") continue; // remove host header
      headers.set(k, v);
    }

    // Proxy request
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      redirect: "manual",
      body: ["GET", "HEAD"].includes(req.method) ? null : req.body,
      agent: targetUrl.startsWith("https") ? new https.Agent({ rejectUnauthorized: false }) : new http.Agent()
    });

    // Copy upstream headers to client
    upstream.headers.forEach((v, k) => res.setHeader(k, v));

    const contentType = upstream.headers.get("content-type") || "";

    // Handle HTML / JS / CSS with rewriting
    if (contentType.includes("text/html") || contentType.includes("application/javascript") || contentType.includes("text/css")) {
      const text = await upstream.text();
      const rewritten = rewriteContent(text, targetUrl);
      return res.send(rewritten);
    }

    // Handle streaming / binary
    const arrayBuffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));

  } catch (err) {
    console.error("Proxy Error:", err);
    return res.status(500).send(`
      <h2>Proxy Error</h2>
      <p>${err.message}</p>
      <p>Tried URL: ${req.path.slice(1)}</p>
    `);
  }
});

app.listen(PORT, () => console.log(`SMART PROXY running at http://localhost:${PORT}`));
