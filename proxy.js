import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = 3000;

// --- Smart Assignment Proxy ---
app.get("/assignment/:encodedURL", async (req, res) => {
    const encodedURL = req.params.encodedURL;
    if (!encodedURL) return res.status(400).send("Missing URL");

    try {
        const target = decodeURIComponent(encodedURL);

        const upstream = await fetch(target, {
            headers: { 
                "User-Agent": req.headers["user-agent"],
                "Accept-Language": req.headers["accept-language"] || "en-US,en;q=0.9"
            }
        });

        const contentType = upstream.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
            // For images, PDFs, etc., just pipe the response
            const buffer = await upstream.buffer();
            res.setHeader("Content-Type", contentType);
            return res.send(buffer);
        }

        let html = await upstream.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // Insert <base> to fix relative URLs
        const baseEl = document.createElement("base");
        baseEl.href = target;
        document.head.prepend(baseEl);

        // Rewrite relative URLs to stay in /assignment/ format
        [...document.querySelectorAll("a, link, script, img, form")].forEach(el => {
            const attr = el.hasAttribute("href") ? "href" :
                         el.hasAttribute("src") ? "src" : null;
            if (!attr) return;

            const val = el.getAttribute(attr);
            if (!val || val.startsWith("http") || val.startsWith("data:")) return;

            const absolute = new URL(val, target).href;
            el.setAttribute(attr, `/assignment/${encodeURIComponent(absolute)}`);
        });

        res.send(dom.serialize());

    } catch (err) {
        res.status(500).send("Upstream error: " + err.message);
    }
});

// Serve static files for the browser UI
app.use(express.static("."));

app.listen(PORT, () => {
    console.log(`Smart Assignment Proxy running at http://localhost:${PORT}`);
});