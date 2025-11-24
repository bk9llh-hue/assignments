import express from "express";
import fetch from "node-fetch";
import Scramjet from "scramjet"; 
const { DataStream } = Scramjet;
import { JSDOM } from "jsdom";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cookieParser());

// Map /google.com → /assignments/<encoded>
app.get("/:site", (req, res, next) => {
    const host = req.params.site;
    if (host.includes(".")) {
        return res.redirect(`/assignments/${encodeURIComponent("https://" + host)}`);
    }
    next();
});

// Assignments proxy
app.get("/assignments/:encoded", async (req, res) => {
    try {
        const target = decodeURIComponent(req.params.encoded);
        const upstream = await fetch(target, {
            headers: {
                "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
                "Accept-Language": req.headers["accept-language"] || "en-US,en;q=0.9",
                "Cookie": req.headers.cookie || ""
            },
            redirect: "manual"
        });

        if (upstream.headers.has("set-cookie")) {
            res.setHeader("set-cookie", upstream.headers.get("set-cookie"));
        }

        const contentType = upstream.headers.get("content-type") || "";
        res.setHeader("content-type", contentType);

        if (!contentType.includes("text/html")) {
            return DataStream.from(upstream.body).pipe(res);
        }

        const html = await upstream.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const rewrite = (url) =>
            `/assignments/${encodeURIComponent(new URL(url, target).href)}`;

        document.querySelectorAll("*").forEach(el => {
            if (el.hasAttribute("href")) {
                const val = el.getAttribute("href");
                if (val && !val.startsWith("http") && !val.startsWith("data:")) {
                    el.setAttribute("href", rewrite(val));
                }
            }
            if (el.hasAttribute("src")) {
                const val = el.getAttribute("src");
                if (val && !val.startsWith("http") && !val.startsWith("data:")) {
                    el.setAttribute("src", rewrite(val));
                }
            }
            if (el.tagName === "FORM" && el.hasAttribute("action")) {
                const val = el.getAttribute("action");
                if (val && !val.startsWith("http")) {
                    el.setAttribute("action", rewrite(val));
                }
            }
        });

        // Inject dynamic fetch/XHR rewrite
        const patch = document.createElement("script");
        patch.textContent = `
            (() => {
                const _fetch = window.fetch;
                window.fetch = (url, opts) => {
                    try {
                        if (url.startsWith("/")) url = location.origin + url;
                        if (!url.startsWith("http")) url = new URL(url, location.href).href;
                        return _fetch("/assignments/" + encodeURIComponent(url), opts);
                    } catch(e) { return _fetch(url, opts); }
                };

                const X = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url) {
                    if (!url.startsWith("http")) url = new URL(url, location.href).href;
                    return X.call(this, method, "/assignments/" + encodeURIComponent(url));
                };
            })();
        `;
        document.head.appendChild(patch);

        DataStream.fromString(dom.serialize()).pipe(res);

    } catch (err) {
        console.error("Assignments Proxy Error:", err);
        res.status(500).send("Assignments Proxy Error: " + err.message);
    }
});

// Serve frontend
app.use(express.static("."));

app.listen(PORT, () => {
    console.log(`Smart Assignments Proxy running → http://localhost:${PORT}`);
});
