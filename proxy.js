import express from "express";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// --- Serve static files (home.html, browser.html, etc) ---
app.use(express.static(__dirname));

// --- Home page (blank) ---
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "home.html"));
});

// --- Proxy handler for any URL ---
// Use RegExp route to match any path after /
app.get(/^\/(.+)$/, async (req, res) => {
    let encodedUrl = req.params[0]; // <-- Express 5 compatible
    if (!encodedUrl) return res.status(400).send("Missing URL");

    // Decode classroom:// style
    let target = decodeURIComponent(encodedUrl);
    if (target.startsWith("classroom://")) target = target.replace("classroom://", "https://");
    else if (!target.startsWith("http")) target = "https://" + target;

    try {
        const upstream = await fetch(target, {
            headers: { "User-Agent": req.headers["user-agent"] || "Mozilla/5.0" }
        });

        const text = await upstream.text();

        // Rewrite relative links to proxy
        const dom = new JSDOM(text);
        const document = dom.window.document;

        [...document.querySelectorAll("a, link, script, img, form")].forEach(el => {
            let attr = el.hasAttribute("href") ? "href" :
                       el.hasAttribute("src") ? "src" : null;
            if (!attr) return;

            const val = el.getAttribute(attr);
            if (!val || val.startsWith("http") || val.startsWith("mailto:")) return;

            const absolute = new URL(val, target).href;
            el.setAttribute(attr, "/" + encodeURIComponent(absolute));
        });

        res.send(dom.serialize());
    } catch (err) {
        console.error(err);
        res.status(500).send("Upstream error: " + err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Proxy running at http://localhost:${PORT}`);
});
