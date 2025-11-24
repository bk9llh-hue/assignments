// proxy.js (ESM) - Smart universal proxy
import express from "express";
import fetch, { Headers } from "node-fetch";
import http from "http";
import https from "https";
import httpProxy from "http-proxy";
import { URL } from "url";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const server = http.createServer(app);
const proxyWs = httpProxy.createProxyServer({ ws: true, secure: false });


const PORT = process.env.PORT || 3000;
const MAX_BODY = "200mb";


// Serve static files from project root
app.use(express.static(__dirname, { index: false }));
// Allow large raw bodies to be forwarded
app.use(express.raw({ type: "*/*", limit: MAX_BODY }));


// ------------------------
});
