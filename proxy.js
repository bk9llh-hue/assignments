import express from "express";
import fetch from "node-fetch";
import { DataStream } from "scramjet";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/assignments/:url", async (req, res) => {
  try {
    const targetUrl = decodeURIComponent(req.params.url);

    // Fetch the website
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
      },
      redirect: "follow",
    });

    // Copy status and headers
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Stream the content using Scramjet DataStream
    const bodyStream = DataStream.fromWeb(response.body);
    await bodyStream.pipe(res);

  } catch (err) {
    console.error("Assignments Proxy Error:", err);
    res.status(500).send("Proxy Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Smart Assignments Scramjet Proxy running → http://localhost:${PORT}`);
});
