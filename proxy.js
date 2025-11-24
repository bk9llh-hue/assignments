import express from "express";
import fetch from "node-fetch";
import jsdom from "jsdom";
import pkg from "scramjet";

const { DataStream } = pkg;
const { JSDOM } = jsdom;

const app = express();
const PORT = process.env.PORT || 10000;

// Root route
app.get("/", (req, res) => {
  res.send(`<h1>Smart Proxy</h1>
  <p>Use <code>/proxy/https://example.com</code> to visit any site.</p>`);
});

// Catch-all proxy route for any URL
app.get("/proxy/*", async (req, res) => {
  try {
    // Everything after /proxy/
    let targetUrl = req.params[0];
    if (!targetUrl) return res.status(400).send("No URL provided");

    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = "https://" + targetUrl;

    const response = await fetch(targetUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
      },
    });

    const contentType = response.headers.get("content-type") || "";

    // Stream non-HTML content
    if (!contentType.includes("text/html")) {
      res.set("content-type", contentType);
      return DataStream.from(response.body).pipe(res);
    }

    // HTML content rewriting
    const html = await response.text();
    const dom = new JSDOM(html);
    const { document } = dom.window;

    // Rewrite links, forms, images, scripts
    document.querySelectorAll("a, link, script, img, form").forEach((el) => {
      const attr = el.tagName === "IMG" || el.tagName === "SCRIPT" ? "src" :
                   el.tagName === "FORM" ? "action" : "href";
      const value = el.getAttribute(attr);
      if (value && !value.startsWith("#") && !value.startsWith("javascript:")) {
        const newUrl = value.startsWith("http") ? value : new URL(value, targetUrl).href;
        el.setAttribute(attr, `/proxy/${newUrl}`);
      }
    });

    res.set("content-type", "text/html");
    res.send(dom.serialize());
  } catch (err) {
    console.error(err);
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
});

// Fallback route
app.all("*", (req, res) => {
  res.status(404).send("Route not found. Use /proxy/https://example.com");
});

app.listen(PORT, () => console.log(`Smart Proxy running → http://localhost:${PORT}`));
