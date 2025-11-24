// proxy.js (ESM) - Smart universal proxy
headers: outHeaders,
redirect: "follow",
body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
agent: upstreamUrl.startsWith("https:") ? new https.Agent({ rejectUnauthorized: false }) : new http.Agent()
};


const upstreamRes = await fetch(upstreamUrl, fetchOpts);


// Sanitize & copy headers
const sanitized = sanitizeOutHeaders(upstreamRes.headers);
for (const [k, v] of Object.entries(sanitized)) {
try { res.setHeader(k, v); } catch {}
}


const ct = (upstreamRes.headers.get("content-type") || "").toLowerCase();


// If HTML/JS/CSS => rewrite minimal URLs
if (ct.includes("text/html") || ct.includes("application/javascript") || ct.includes("text/javascript") || ct.includes("text/css")) {
const text = await upstreamRes.text();
const rewritten = rewriteForProxy(text, upstreamUrl);
res.setHeader("content-type", upstreamRes.headers.get("content-type") || "text/html; charset=utf-8");
return res.status(upstreamRes.status).send(rewritten);
}


// Otherwise stream binary
res.status(upstreamRes.status);
if (upstreamRes.body && typeof upstreamRes.body.pipe === "function") {
upstreamRes.body.pipe(res);
} else {
const buf = Buffer.from(await upstreamRes.arrayBuffer());
res.send(buf);
}
} catch (err) {
console.error("PROXY HANDLER ERROR:", err);
if (err && err.code === "ENOTFOUND") return res.status(502).send("Upstream DNS lookup failed: " + (err.hostname || "unknown"));
return res.status(500).send("Proxy internal error: " + (err.message || String(err)));
}
});


proxyWs.on("error", (err) => console.error("HTTP-Proxy error:", err));


server.listen(PORT, () => {
console.log(`Smart universal proxy listening on :${PORT}`);
});
