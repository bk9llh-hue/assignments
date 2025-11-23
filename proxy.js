import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = 3000;

// --- fetch handler ---
app.get("/proxy", async (req, res) => {
    const target = req.query.url;
    if (!target) return res.status(400).send("Missing ?url=");

    try {
        const upstream = await fetch(target, {
            headers: { "User-Agent": req.headers["user-agent"] }
        });

        const text = await upstream.text();

        // Rewrite all relative URLs
        const dom = new JSDOM(text);
        const document = dom.window.document;

        [...document.querySelectorAll("a, link, script, img, form")].forEach(el => {
            const attr = el.hasAttribute("href") ? "href" :
                         el.hasAttribute("src") ? "src" : null;
            if (!attr) return;

            const val = el.getAttribute(attr);
            if (!val) return;
            if (val.startsWith("http")) return;

            const absolute = new URL(val, target).href;
            el.setAttribute(attr, `/proxy?url=${encodeURIComponent(absolute)}`);
        });

        res.send(dom.serialize());
    } catch (err) {
        res.status(500).send("Upstream error: " + err.message);
    }
});

// --- homepage ---
app.use(express.static("."));

app.listen(PORT, () => {
    console.log(`Proxy running at http://localhost:${PORT}`);
});