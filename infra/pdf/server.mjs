import { createServer } from "node:http";
import { chromium } from "@playwright/test";

const origin = new URL(process.env.APP_ORIGIN || "http://nginx").origin;
const browser = await chromium.launch();
let active = 0;

async function render(input) {
  if (!/^[0-9a-f-]{36}$/i.test(input.jobId || "") || !/^[A-Za-z0-9_-]{43}$/.test(input.token || "")) throw new Error("Invalid request");
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const allowed = url.origin === origin && (url.pathname === "/print/" + input.jobId ||
        url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icons/") ||
        url.pathname.startsWith("/api/pdf/render/" + input.jobId + "/files/"));
      if (!allowed) { await route.abort(); return; }
      await route.continue({ headers: { ...route.request().headers(), authorization: "Bearer " + input.token } });
    });
    const page = await context.newPage();
    const response = await page.goto(origin + "/print/" + input.jobId, { waitUntil: "networkidle", timeout: 45_000 });
    if (!response?.ok()) throw new Error("Print source unavailable");
    await page.locator("[data-print-root]").waitFor({ timeout: 5000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => {
        if (image.complete) {
          if (!image.naturalWidth) throw new Error("Print image unavailable");
          return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", () => reject(new Error("Print image unavailable")), { once: true });
        });
      }));
    });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: '<div style="font-size:8px;width:100%;text-align:right;padding:0 64px;color:#656565"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  } finally { await context.close(); }
}

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "GET" && request.url === "/health") { response.end("ok"); return; }
  if (request.method !== "POST" || request.url !== "/render") { response.writeHead(404).end(); return; }
  if (active >= 2) { response.writeHead(429).end(); return; }
  active++;
  try {
    let length = 0;
    const chunks = [];
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 8192) throw new Error("Request too large");
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const pdf = await render(input);
    response.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length });
    response.end(pdf);
  } catch {
    // Never log job credentials or private portfolio content.
    response.writeHead(503).end();
  } finally { active--; }
});

server.listen(3001, "0.0.0.0");
async function close() { server.close(); await browser.close(); }
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
