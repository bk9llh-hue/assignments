import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = 3000;

// Serve static files (browser.html, sw.js, etc.)
app.use(express.static('.'));

// --- Universal path proxy ---
app.get("/*", async (req, res) => {
    const path = req.path.slice(1); // remove leading "/"
    
    // If no path, show blank homepage
    if(!path) return res.send('<!DOCTYPE html><html><head><title>Home</title></head><body></body></html>');

    let target = path;
    if(!target.startsWith('http')) target = 'https://' + target;

    try {
        const upstream = await fetch(target, {
            headers: { "User-Agent": req.headers["user-agent"] }
        });

        const text = await upstream.text();

        // Rewrite relative URLs and strip CSP/X-Frame restrictions
        const dom = new JSDOM(text);
        const document = dom.window.document;

        // Remove CSP
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
            el.setAttribute(attr, '/' + encodeURIComponent(absolute));
        });

        res.setHeader('X-Content-Type-Options','nosniff');
        res.send(dom.serialize());

    } catch(err){
        res.status(500).send("Proxy error: " + err.message);
    }
});

app.listen(PORT, () => console.log(`Smart proxy running at http://localhost:${PORT}`));
