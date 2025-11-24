import express from "express";
import fetch from "node-fetch";
import Scramjet from "scramjet";
const { DataStream, StringStream } = Scramjet;
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());

// Auto-map short domains: /google.com → /assignments/https%3A%2F%2Fgoogle.com
app.get("/:site", (req, res, next) => {
  const host = req.params.site;
  if (host.includes(".")) {
    return res.redirect(`/assignments/${encodeURIComponent("https://" + host)}`);
  }
  next();
});

// -------------------------------
// Full streaming assignments proxy
app.all("/assignments/:encoded", async (req, res) => {
  try {
    const target = decodeURIComponent(req.params.encoded);

    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        "User-Agent": req.headers["user-agent"] ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
        "Accept-Language": req.headers["accept-language"] || "en-US,en;q=0.9",
        "Cookie": req.headers.cookie || ""
      },
      redirect: "follow",
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
    });

    // Forward headers
    upstream.headers.forEach((v, k) => {
      if (k.toLowerCase() === "set-cookie") {
        res.setHeader(k, v);
      } else if (!["content-encoding", "transfer-encoding"].includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    });

    const contentType = upstream.headers.get("content-type") || "";
    res.setHeader("content-type", contentType);

    // Stream non-HTML directly
    if (!contentType.includes("text/html")) {
      return DataStream.from(upstream.body).pipe(res);
    }

    // Stream HTML with dynamic link/script/form rewriting
    const chunks = [];
    upstream.body.on("data", chunk => chunks.push(chunk));
    upstream.body.on("end", () => {
      let html = Buffer.concat(chunks).toString("utf8");

      // Inject script to rewrite links dynamically
      html = html.replace(
        /(<head.*?>)/i,
        `$1
        <script>
        (function(){
          function rewrite(el){
            ["href","src","action"].forEach(attr=>{
              if(el[attr] && !el[attr].startsWith("http") && !el[attr].startsWith("data:")){
                el[attr] = "/assignments/" + encodeURIComponent(new URL(el[attr], location.href).href);
              }
            });
          }
          document.querySelectorAll("a,link,script,img,form").forEach(rewrite);

          // Patch fetch and XHR to go through proxy
          const _fetch = window.fetch;
          window.fetch = function(url, opts){
            if(!url.startsWith("http")) url = new URL(url, location.href).href;
            return _fetch("/assignments/"+encodeURIComponent(url), opts);
          };
          const X = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method,url){
            if(!url.startsWith("http")) url = new URL(url, location.href).href;
            return X.call(this, method, "/assignments/"+encodeURIComponent(url));
          };
        })();
        </script>`
      );

      StringStream.from(html).pipe(res);
    });

  } catch (err) {
    console.error("Assignments Proxy Error:", err);
    res.status(500).send("Assignments Proxy Error: " + err.message);
  }
});

// Serve frontend
app.use(express.static("."));

// Start server
app.listen(PORT, () => {
  console.log(`Smart Assignments Proxy running → http://localhost:${PORT}`);
});
