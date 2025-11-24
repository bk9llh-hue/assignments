import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 10000;

let browser;

// Launch Puppeteer once on startup
(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  console.log("Smart Assignments Proxy running → http://localhost:" + PORT);
})();

// Helper: rewrite relative links in HTML
function rewriteLinks(html) {
  return html.replace(
    /(<head.*?>)/i,
    `$1
    <script>
      (function(){
        function rewrite(el){
          ['href','src','action'].forEach(attr=>{
            if(el[attr] && !el[attr].startsWith('http') && !el[attr].startsWith('data:')){
              el[attr] = '/assignments/' + encodeURIComponent(new URL(el[attr], location.href).href);
            }
          });
        }
        document.querySelectorAll('a,link,script,img,form').forEach(rewrite);

        const _fetch = window.fetch;
        window.fetch = function(url, opts){
          if(!url.startsWith('http')) url = new URL(url, location.href).href;
          return _fetch('/assignments/'+encodeURIComponent(url), opts);
        };

        const X = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method,url){
          if(!url.startsWith('http')) url = new URL(url, location.href).href;
          return X.call(this, method, '/assignments/'+encodeURIComponent(url));
        };
      })();
    </script>`
  );
}

// Main proxy route
app.all("/assignments/:encodedURL", async (req, res) => {
  const target = decodeURIComponent(req.params.encodedURL);

  if (!browser) return res.status(503).send("Browser not ready");

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": req.headers["accept-language"] || "en-US,en;q=0.9"
    });

    const response = await page.goto(target, {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    if (!response || !response.ok()) {
      await page.close();
      return res.status(response ? response.status() : 500).send("Failed to load page");
    }

    let html = await page.content();
    html = rewriteLinks(html);

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(html);

    await page.close();
  } catch (err) {
    console.error("Assignments Proxy Error:", err);
    res.status(500).send("Assignments Proxy Error: " + err.message);
  }
});

// Optional short-domain redirect: /google.com → /assignments/https://google.com
app.get("/:site", (req, res, next) => {
  const host = req.params.site;
  if (host.includes(".")) {
    return res.redirect(`/assignments/${encodeURIComponent("https://" + host)}`);
  }
  next();
});

// Serve static files (optional frontend UI)
app.use(express.static("."));

// Start server
app.listen(PORT);
