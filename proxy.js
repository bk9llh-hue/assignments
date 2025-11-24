import express from "express";
import fetch from "node-fetch";
import Scramjet from "scramjet";  // <-- v4 compatible import
const { DataStream } = Scramjet;
import { JSDOM } from "jsdom";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse cookies
app.use(cookieParser());

// -------------------------------
// Auto URL Mapper
// /google.com → /assignments/<encoded URL>
app.get("/:site", (req, res, next) => {
    const host = req.params.site;

    // Only treat things that look like domains
    if (host.includes(".")) {
        const url = `https://${host}`;
        return res.redirect(`/assignments/${encodeURIComponent(url)}`);
    }

    next();
});

// -------------------------------
// Scramjet-powered Assignments Proxy
// -------------------------------
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

        // Forward cookies
        if (upstream.headers.has("set-cookie")) {
            res.setHeader("set-cookie", upstream.headers.get("set-cookie"));
        }

        const contentType = upstream.headers.get("content-type") || "";
        res.setHeader("content-type", contentType);

        // Stream non-HTML directly
        if (!contentType.includes("text/html")) {
            return DataStream.from(upstream.body).pipe(res);
        }

        // Parse HTML and rewrite
        const html = await upstream.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const rewrite = (url) =>
            `/assignments/${encodeURIComponent(new URL(url, target).href)}`;

        // Rewrite static links, images, scripts, and forms
        document.querySelectorAll("*").forEach((el) => {
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

        // Inject dynamic rewriting for fetch and XMLHttpRequest
        const patch = document.createElement("script");
        patch.textContent = `
            (() => {
                const _fetch = window.fetch;
                window.fetch = (url, opts) => {
                    try {
                        if (url.startsWith("/")) url = location.origin + url;
                        if (!url.startsWith("http")) url = new URL(url, location.href).href;
                        return _fetch("/assignments/" + encodeURIComponent(url), opts);
                    } catch (e) { return _fetch(url, opts); }
                };

                const X = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url) {
                    if (!url.startsWith("http")) url = new URL(url, location.href).href;
                    return X.call(this, method, "/assignments/" + encodeURIComponent(url));
                };
            })();
        `;
        document.head.appendChild(patch);

        // Serialize and stream
        const output = dom.serialize();
        DataStream.fromString(output).pipe(res);

    } catch (err) {
        console.error("Assignments Proxy Error:", err);
        res.status(500).send("Assignments Proxy Error: " + err.message);
    }
});

// -------------------------------
// Serve static frontend
// -------------------------------
app.use(express.static("."));

app.listen(PORT, () => {
    console.log(`Smart Assignments Proxy running → http://localhost:${PORT}`);
});
