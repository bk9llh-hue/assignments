import express from "express";
import puppeteer from "puppeteer";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cookieParser());
app.use(express.static("."));

// Puppeteer browser instance (headless)
let browser;
(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  console.log("Puppeteer browser launched");
})();

// --- Assignments Proxy ---
app.get("/assignments/:encodedURL", async (req, res) => {
  try {
    const encodedURL = req.params.encodedURL;
    if (!encodedURL) return res.status(400).send("Missing URL");

    const target = decodeURIComponent(encodedURL);

    if (!browser) return res.status(500).send("Browser not ready");

    const page = await browser.newPage();

    // Forward headers & cookies
    await page.setExtraHTTPHeaders({
      "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
      "Accept-Language": req.headers["accept-language"] || "en-US,en;q=0.9",
    });

    // Set cookies from client
    if (req.headers.cookie) {
      const cookies = req.headers.cookie.split(";").map(c => {
        const [name, ...v] = c.trim().split("=");
        return { name, value: v.join("="), domain: new URL(target).hostname };
      });
      await page.setCookie(...cookies);
    }

    // Go to target URL
    await page.goto(target, { waitUntil: "networkidle2", timeout: 60000 });

    // Get HTML content
    let html = await page.content();

    // Optional: fix <base> for relative links
    html = html.replace(
      /<head>/i,
      `<head><base href="${target}">`
    );

    // Close page
    await page.close();

    res.send(html);
  } catch (err) {
    console.error("Assignments Proxy Error:", err);
    res.status(500).send("Assignments Proxy Error: " + err.message);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Smart Assignments Proxy running → http://localhost:${PORT}`);
});
