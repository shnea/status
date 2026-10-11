import assert from "node:assert/strict";
import { createServer } from "node:http";

const cookie = "STATUS_SESSION=proxy-fixture; ui=fixture";
const portfolio = "11111111-1111-4111-8111-111111111111";
const file = "22222222-2222-4222-8222-222222222222";
const publicFile = `/api/public/files/${portfolio}/${file}`;
const privateFile = `/api/files/${file}`;

if (process.argv[2] === "upstream") {
  for (const port of [8080, 3000]) {
    createServer((request, response) => {
      response.setHeader("X-Fixture-Cookie-Present", request.headers.cookie ? "1" : "0");
      response.setHeader("X-Fixture-Cookie-Intact", request.headers.cookie === cookie ? "1" : "0");
      response.setHeader("X-Fixture-Csrf-Intact", request.headers["x-csrf-token"] === "fixture-csrf" ? "1" : "0");
      response.setHeader("Content-Type", "text/plain");
      if (request.headers.range === "bytes=0-6") {
        response.setHeader("Content-Range", "bytes 0-6/7");
        response.writeHead(206);
      }
      response.end("fixture");
    }).listen(port, "0.0.0.0");
  }
} else {
  assert.equal(process.argv[2], "check");
  const origin = process.argv[3];
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt++) {
    try {
      const response = await fetch(origin + "/actuator/health", { signal: AbortSignal.timeout(2000) });
      await response.arrayBuffer();
      ready = response.ok;
    } catch { /* Wait for the isolated proxy and synthetic upstream. */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Fixture proxy must start");

  const publicPaths = [
    ...["preview", "thumbnail", "original", "download"].map((variant) => `${publicFile}/content/${variant}`),
    `${publicFile}/content/preview?v=fixture`,
    `${publicFile}/views`, `${publicFile}/hls/master.m3u8`,
    `${publicFile}/hls/segment-0001.ts`, `${publicFile}/hls/subtitles.vtt`,
    `/api/public/site/files/${file}/content/preview`,
  ];
  let checks = 0;
  for (const method of ["GET", "HEAD"]) {
    for (const path of publicPaths) {
      const response = await fetch(origin + path, { method, headers: { Cookie: cookie } });
      const body = await response.text();
      assert.equal(response.status, 200, `${method} ${path}`);
      assert.equal(response.headers.get("x-fixture-cookie-present"), "0", "Public file reads must not open a login session");
      assert.equal(body, method === "HEAD" ? "" : "fixture");
      assert.ok(response.headers.get("cache-control").includes("no-store"));
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      checks++;
    }
  }
  const sessionPaths = [
    ["GET", `${privateFile}/content/preview`], ["GET", `${privateFile}/views`],
    ["GET", `${privateFile}/hls/master.m3u8`], ["GET", "/api/session"],
    ["GET", "/api/portfolio"], ["GET", "/api/admin/overview"],
    ["GET", "/oauth2/authorization/platform"], ["GET", "/callback?code=fixture"],
    ["POST", "/logout"], ["POST", "/api/files"],
    ["POST", "/api/public/portfolios/fixture/visit"],
    ["POST", "/api/public/portfolios/fixture/ai"],
    ["GET", `/api/public/portfolios/fixture/ai/${file}`],
    ["POST", `/api/public/portfolios/fixture/ai/${file}/cancel`],
    ["POST", `${publicFile}/content/preview`], ["GET", "/dashboard"],
  ];
  for (const [method, path] of sessionPaths) {
    const response = await fetch(origin + path, { method, headers: { Cookie: cookie, "X-CSRF-TOKEN": "fixture-csrf" } });
    await response.arrayBuffer();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-fixture-cookie-intact"), "1", `${method} ${path} must preserve authentication`);
    assert.equal(response.headers.get("x-fixture-csrf-intact"), "1", "Proxy must preserve CSRF validation headers");
    checks++;
  }
  const range = await fetch(origin + `${publicFile}/content/original`, { headers: { Cookie: cookie, Range: "bytes=0-6" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 0-6/7");
  assert.equal(range.headers.get("x-fixture-cookie-present"), "0");
  assert.equal(await range.text(), "fixture");
  process.stdout.write(`Public file proxy passed ${checks + 1} cookie, authentication, CSRF, and Range checks.\n`);
}
