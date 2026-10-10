import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const role = process.argv[2];
assert.ok(["frontend", "pdf"].includes(role));
assert.notEqual(process.getuid(), 0, "Runtime images must use a non-root user");
let name = "런타임 검사";
const jobId = "11111111-1111-4111-8111-111111111111";
const token = "A".repeat(43);
let protectedReads = 0;
const stub = createServer((request, response) => {
  if (request.url === "/api/public/site") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ serviceName: name, announcement: "검사 공지", shareImageUrl: "/share-default.png", imageMaxMiB: 10, attachmentMaxMiB: 10 }));
  } else if (request.url === "/print/" + jobId) {
    assert.equal(request.headers.authorization, "Bearer " + token);
    protectedReads++;
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html lang="ko"><body><main data-print-root><h1>상태창 인쇄 검사</h1><p>비공개 검사 문서</p></main></body></html>');
  } else {
    response.writeHead(404).end();
  }
});
let child;
try {
  await new Promise((resolve) => stub.listen(4001, "127.0.0.1", resolve));
  child = spawn(process.execPath, [role === "frontend" ? "server.js" : "server.mjs"], { cwd: "/app", env: { ...process.env, HOSTNAME: "127.0.0.1", BACKEND_URL: "http://127.0.0.1:4001", APP_ORIGIN: "http://127.0.0.1:4001", APP_PUBLIC_URL: "https://release-fixture.example.invalid", GOOGLE_SITE_VERIFICATION: "public-fixture-verification" }, stdio: "inherit" });
  const origin = role === "frontend" ? "http://127.0.0.1:3000" : "http://127.0.0.1:3001";
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt++) {
    try { ready = (await fetch(origin + (role === "frontend" ? "/login" : "/health"), { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Wait only for the isolated runtime process. */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, "Packaged runtime must start");
  if (role === "frontend") {
    let response = await fetch(origin);
    assert.equal(response.status, 200);
    let html = await response.text();
    assert.ok(html.includes(name));
    assert.ok(html.includes("public-fixture-verification"));
    assert.ok(html.includes("https://release-fixture.example.invalid"));
    assert.ok(html.includes('id="content"'));
    assert.ok(!html.includes("nextjs-portal"));
    name = "설정 변경 검사";
    html = await (await fetch(origin)).text();
    assert.ok(html.includes(name), "Public service settings must refresh without rebuilding");
    response = await fetch(origin + "/share-default.png");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
    for (const template of ["swiss", "hud", "google-flat", "modern-flat", "premium-dark"]) {
      response = await fetch(origin + "/design-preview/" + template);
      assert.equal(response.status, 200);
      const sample = await response.text();
      assert.ok(sample.includes("noindex"));
      assert.ok(sample.includes("김상태"));
    }
  } else {
    const response = await fetch(origin + "/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, token }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const pdf = Buffer.from(await response.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 3000);
    assert.equal(protectedReads, 1);
  }
  process.stdout.write("Packaged " + role + " runtime passed non-root startup and isolated HTTP checks.\n");
} finally {
  child?.kill("SIGTERM");
  stub.closeAllConnections();
  stub.close();
}
