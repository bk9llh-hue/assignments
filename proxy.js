import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = 3000;

// Static files
app.use(express.static('.'));

// --- smarter proxy handler ---
app.get("/assignment/:encodedUrl", async (req, res) => {
    const target = decodeURIComponent(req.params.encodedUrl);
    if(!target) return res.status(400).send("Missing URL");

    try {
        const upstream = await fetch(target, {
            headers: { "User-Agent": req.headers["user-agent"] }
        });

        let text = await upstream.text();

        // Fix X-Frame-Options and CSP to allow embedding
        const dom = new JSDOM(text);
        const document = dom.window.document;

        // Remove CSP & X-Frame headers
        const metaCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        if(metaCSP) metaCSP.remove();

        // Rewrite relative URLs to proxy
        [...document.querySelectorAll("a, link, script, img, form")].forEach(el => {
            const attr = el.hasAttribute("href") ? "href" :
                         el.hasAttribute("src") ? "src" : null;
            if(!attr) return;

            const val = el.getAttribute(attr);
            if(!val) return;
            if(val.startsWith("http")) return;

            const absolute = new URL(val, target).href;
            el.setAttribute(attr, `/assignment/${encodeURIComponent(absolute)}`);
        });

        res.setHeader('X-Content-Type-Options','nosniff');
        res.send(dom.serialize());
    } catch(err){
        res.status(500).send("Proxy error: " + err.message);
    }
});

// Listen
app.listen(PORT, () => console.log(`Smart proxy running at http://localhost:${PORT}`));
