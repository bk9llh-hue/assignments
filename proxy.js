import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = process.env.PORT || 3000;

// --- Serve static files ---
app.use(express.static("."));

// --- Main route: '/' shows blank home page ---
app.get("/", (req, res) => {
  res.sendFile(`${__dirname}/home.html`);
});

// --- Smart site route: '/:site' proxies target site ---
app.get("/:site", async (req, res) => {
  const target = req.params.site;

  // Prevent empty or invalid paths
  if (!target || target === "favicon.ico") return res.status(404).send("Not found");

  const url = target.startsWith("http") ? target : `https://${target}`;

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": req.headers["user-agent"] },
    });

    let text = await upstream.text();

    // Rewrite relative URLs
    const dom = new JSDOM(text);
    const document = dom.window.document;

    [...document.querySelectorAll("a, link, script, img, form")].forEach((el) => {
      const attr = el.hasAttribute("href") ? "href" : el.hasAttribute("src") ? "src" : null;
      if (!attr) return;

      const val = el.getAttribute(attr);
      if (!val || val.startsWith("http") || val.startsWith("//")) return;

      const absolute = new URL(val, url).href;
      el.setAttribute(attr, `/${encodeURIComponent(absolute)}`);
    });

    // Strip restrictive CSP and X-Frame headers
    res.removeHeader("content-security-policy");
    res.removeHeader("x-frame-options");

    res.send(dom.serialize());
  } catch (err) {
    res.status(500).send("Upstream error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
