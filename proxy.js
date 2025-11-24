import express from "express";
import fetch from "node-fetch";
import pkg from "scramjet";
const { DataStream } = pkg;
import { JSDOM } from "jsdom";
import { URL } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Rewrite HTML links and scripts to proxy
function rewriteHtml(html, baseUrl) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const attrsToRewrite = [
    { tag: "a", attr: "href" },
    { tag: "img", attr: "src" },
    { tag: "script", attr: "src" },
    { tag: "link", attr: "href" },
    { tag: "form", attr: "action" },
    { tag: "iframe", attr: "src" },
  ];

  attrsToRewrite.forEach(({ tag, attr }) => {
    doc.querySelectorAll(tag).forEach(el => {
      const val = el.getAttribute(attr);
      if (val && !val.startsWith("#") && !val.startsWith("data:")) {
        try {
          const absoluteUrl = new URL(val, baseUrl).toString();
          el.setAttribute(attr, `/${encodeURIComponent(absoluteUrl)}`);
        } catch {}
      }
    });
  });

  // Rewrite inline JS URLs (fetch, XMLHttpRequest, location)
  doc.querySelectorAll("script").forEach(script => {
    if (!script.src && script.textContent) {
      script.textContent = script.textContent.replace(
        /(fetch|XMLHttpRequest|window\.location|document\.location)\(['"]([^'"]+)['"]\)/g,
        (m, p1, url) => {
          try {
            const absoluteUrl = new URL(url, baseUrl).toString();
            return `${p1}('/${encodeURIComponent(absoluteUrl)}')`;
          } catch {
            return m;
          }
        }
      );
    }
  });

  return dom.serialize();
}

// Main proxy: catches ANY path
app.get("/*", async (req, res) => {
  try {
    let targetUrl = decodeURIComponent(req.path.slice(1)); // Remove leading "/"

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl; // default to HTTPS
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
      },
      redirect: "follow",
    });

    res.status(response.status);

    response.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const html = await response.text();
      const rewritten = rewriteHtml(html, targetUrl);
      await DataStream.fromString(rewritten).pipe(res);
    } else {
      await DataStream.fromWeb(response.body).pipe(res);
    }
  } catch (err) {
    console.error("Proxy Error:", err);
    res.status(500).send("Proxy Error: " + err.message);
  }
});

// Simple root message
app.get("/", (req, res) => {
  res.send(`
    <h2>Smart Scramjet Proxy is running</h2>
    <p>Use /google.com or /youtube.com to proxy any website.</p>
  `);
});

app.listen(PORT, () => {
  console.log(`Smart Scramjet Proxy running → http://localhost:${PORT}`);
});
