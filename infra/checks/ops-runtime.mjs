import assert from "node:assert/strict";

const origin = "http://nginx";
const health = await fetch(origin + "/actuator/health");
assert.equal(health.status, 200);
assert.equal((await health.json()).status, "UP");
const home = await fetch(origin + "/");
assert.equal(home.status, 200);
const html = await home.text();
assert.ok(html.includes("상태창"));
assert.ok(!html.includes("nextjs-portal"));
const designs = await fetch(origin + "/api/public/designs");
assert.equal(designs.status, 200);
assert.equal((await designs.json()).filter(design => design.implemented && design.enabled).length, 5);
for (const template of ["swiss", "hud", "google-flat", "modern-flat", "premium-dark"]) {
  const page = await fetch(origin + "/design-preview/" + template);
  assert.equal(page.status, 200);
  const content = await page.text();
  assert.ok(content.includes("noindex"));
  assert.ok(content.includes("김상태"));
}
assert.equal((await fetch("http://pdf:3001/health")).status, 200);
assert.equal((await fetch(origin + "/api/admin/overview")).status, 401);
console.log("Runtime Compose proxy, packaged pages, all five templates and internal PDF health passed.");
