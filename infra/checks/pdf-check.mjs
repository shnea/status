import { createServer, request as proxyRequest } from "node:http";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { printFixture } from "./tests/fixtures/pdf.mjs";

const jobId = "11111111-1111-4111-8111-111111111111";
const token = "Z".repeat(43);
const view = printFixture();
const children = [];
let image;
let imageReads = 0;
let bannerReads = 0;
const bannerId = "88888888-8888-4888-8888-888888888888";
view.document.profile.title = "포트폴리오 메인 타이틀";
view.document.profile.bannerImageId = bannerId;

const stub = createServer((request, response) => {
  if (request.headers.authorization !== "Bearer " + token) { response.writeHead(404).end(); return; }
  if (request.url === "/api/pdf/render/" + jobId) {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(view)); return;
  }
  if (request.url.startsWith("/api/pdf/render/" + jobId + "/files/")) {
    imageReads++;
    if (request.url.includes(bannerId)) bannerReads++;
    response.writeHead(200, { "Content-Type": "image/png" }).end(image); return;
  }
  response.writeHead(404).end();
});

const proxy = createServer((request, response) => {
  const port = request.url.startsWith("/api/") ? 4001 : 3000;
  const upstream = proxyRequest({ hostname: "127.0.0.1", port, path: request.url, method: request.method, headers: request.headers }, (result) => {
    response.writeHead(result.statusCode, result.headers); result.pipe(response);
  });
  upstream.on("error", () => response.writeHead(502).end());
  request.pipe(upstream);
});

async function ready(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch { /* Wait for the isolated process only. */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Isolated PDF check did not become ready");
}

function start(path, args, env) {
  const child = spawn(process.execPath, [path, ...args], { cwd: "/work", env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] });
  children.push(child); return child;
}

try {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
    await page.setContent('<html><body style="margin:0;width:800px;height:400px;background:#ddd9cd;display:flex;align-items:center;justify-content:center"><div style="width:280px;height:140px;border:18px solid #191919;border-top-width:40px"><div style="width:36%;height:100%;border-right:12px solid #191919;background:#b44228"></div></div></body></html>');
    image = await page.screenshot();
  } finally { await browser.close(); }
  await new Promise((resolve) => stub.listen(4001, "127.0.0.1", resolve));
  start("/work/node_modules/next/dist/bin/next", ["dev", "--hostname", "127.0.0.1"], {
    BACKEND_URL: "http://127.0.0.1:4001", APP_PUBLIC_URL: "https://portfolio.example.test", NEXT_TELEMETRY_DISABLED: "1",
  });
  await new Promise((resolve) => proxy.listen(4002, "127.0.0.1", resolve));
  start("/work/pdf-worker.mjs", [], { APP_ORIGIN: "http://127.0.0.1:4002" });
  await ready("http://127.0.0.1:4002/login");
  await ready("http://127.0.0.1:3001/health");
  assert.equal((await fetch("http://127.0.0.1:4002/print/" + jobId)).status, 404);
  for (const template of ["swiss", "hud", "google-flat", "modern-flat", "premium-dark"]) {
    view.document.template = template;
    const about = view.document.sections.find((section) => section.id === "about");
    const remaining = view.document.sections.filter((section) => section.id !== "about");
    const inspector = await chromium.launch();
    try {
      const page = await inspector.newPage({ extraHTTPHeaders: { Authorization: "Bearer " + token } });
      const inspectOrder = async (expected) => {
        await page.goto("http://127.0.0.1:4002/print/" + jobId);
        assert.deepEqual(await page.locator("[data-print-section]").evaluateAll((sections) => sections.map((section) => section.dataset.printSection)), expected);
      };
      view.document.sections = [about, ...remaining];
      await inspectOrder(["about", "skills", "projects", "history", "certifications"]);
      view.document.sections = [...remaining, about];
      await inspectOrder(["skills", "projects", "history", "certifications", "about"]);
      about.visible = false;
      await inspectOrder(["skills", "projects", "history", "certifications"]);
      assert.equal(await page.getByText("자기소개 마지막 문단", { exact: true }).count(), 0);
      about.visible = true;
    } finally { await inspector.close(); }
    imageReads = 0;
    bannerReads = 0;
    const response = await fetch("http://127.0.0.1:3001/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, token }) });
    assert.equal(response.status, 200, template + " print component must produce a PDF");
    const pdf = Buffer.from(await response.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(imageReads > 0, "Private image requests must carry the scoped credential");
    if (template === "swiss") assert.equal(bannerReads, 0, "Swiss must exclude the retained banner");
    else assert.ok(bannerReads > 0, "The separate banner must carry the scoped credential");
    assert.equal(pdf.includes(Buffer.from(token)), false);
    await writeFile("/artifacts/pdf/portfolio-" + template + ".pdf", pdf);
  }
  const rejected = await fetch("http://127.0.0.1:3001/render", { method: "POST", body: JSON.stringify({ jobId, token: "invalid" }) });
  assert.equal(rejected.status, 503);
  process.stdout.write("All five print styles passed main-title and protected document/profile/banner image checks.\n");
} finally {
  for (const child of children) child.kill("SIGTERM");
  stub.closeAllConnections(); stub.close();
  proxy.closeAllConnections(); proxy.close();
}
