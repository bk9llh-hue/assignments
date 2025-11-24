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

// Rewrite URLs to go through the proxy
function rewriteUrls(html, baseUrl) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const elements = [
    { tag: "a", attr: "href" },
    { tag: "img", attr: "src" },
    { tag: "script", attr: "src" },
    { tag: "link", attr: "href" },
    { tag: "form", attr: "action" },
  ];

  elements.forEach(({ tag, attr }) => {
    document.querySelectorAll(tag).forEach(el => {
      const url = el.getAttribute(attr);
      if (url && !url.startsWith("data:") && !url.startsWith("#")) {
        try {
          const absoluteUrl = new URL(url, baseUrl).toString();
          el.setAttribute(attr, `/assignments/${encodeURIComponent(absoluteUrl)}`);
        } catch {}
      }
    });
  });

  return dom.serialize();
}

// Main proxy route
app.get("/assignments/:url", async (req, res) => {
  try {
    const targetUrl = decodeURIComponent(req.params.url);

    const response = await fetch(targetUrl, {
      headers: { "User-Agent": req.headers["user-agent"] || "Mozilla/5.0", Accept: "*/*" },
      redirect: "follow",
    });

    // Forward headers (skip some)
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const text = await response.text();
      const rewritten = rewriteUrls(text, targetUrl);
      await DataStream.fromString(rewritten).pipe(res);
    } else {
      await DataStream.fromWeb(response.body).pipe(res);
    }
  } catch (err) {
    console.error("Assignments Proxy Error:", err);
    res.status(500).send("Proxy Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Smart Assignments Scramjet Proxy running → http://localhost:${PORT}`);
});
