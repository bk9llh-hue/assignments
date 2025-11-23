import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('.'));

// --- Universal catch-all route ---
// Express 5 requires a named parameter for catch-all
app.get("/:encodedUrl(*)", async (req, res) => {
    const encodedPath = req.params.encodedUrl; // everything after '/'
    
    // Blank homepage if no path
    if(!encodedPath) return res.send('<!DOCTYPE html><html><head><title>Home</title></head><body></body></html>');

    let target = decodeURIComponent(encodedPath);
    if(!target.startsWith('http')) target = 'https://' + target;

    try {
        const upstream = await fetch(target, {
            headers: {
                "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
                "Accept": "*/*",
                "Accept-Encoding": "identity"
            }
        });

        const contentType = upstream.headers.get('content-type') || '';

        // If binary (image, pdf, etc.), pipe directly
        if(!contentType.includes('text/html')){
            const buffer = await upstream.arrayBuffer();
            res.setHeader('Content-Type', contentType);
            return res.send(Buffer.from(buffer));
        }

        const text = await upstream.text();

        // Parse HTML
        const dom = new JSDOM(text);
        const document = dom.window.document;

        // --- Remove CSP and frame restrictions ---
        document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach(e => e.remove());
        document.querySelectorAll('meta[http-equiv="X-Frame-Options"]').forEach(e => e.remove());
        // Remove frame options headers if possible
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');

        // Rewrite relative URLs
        [...document.querySelectorAll("a, link, script, img, form")].forEach(el => {
            const attr = el.hasAttribute("href") ? "href" :
                         el.hasAttribute("src") ? "src" : null;
            if(!attr) return;

            const val = el.getAttribute(attr);
            if(!val) return;
            if(val.startsWith("http") || val.startsWith("data:")) return;

            const absolute = new URL(val, target).href;
            el.setAttribute(attr, '/' + encodeURIComponent(absolute));
        });

        // Inject base tag to help relative links
        const baseTag = document.createElement('base');
        baseTag.href = '/';
        document.head.prepend(baseTag);

        res.setHeader('X-Content-Type-Options','nosniff');
        res.send(dom.serialize());

    } catch(err){
        console.error(err);
        res.status(500).send("Proxy error: " + err.message);
    }
});

app.listen(PORT, () => console.log(`Smart proxy running at http://localhost:${PORT}`));
