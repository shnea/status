import assert from "node:assert/strict";

const origin = process.env.BACKEND_CHECK_ORIGIN;
assert.ok(origin);
let ready = false;
for (let attempt = 0; attempt < 60 && !ready; attempt++) {
  try {
    const response = await fetch(origin + "/actuator/health", { signal: AbortSignal.timeout(1000) });
    ready = response.ok && (await response.json()).status === "UP";
  } catch { /* Only wait for the private image-check fixture. */ }
  if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(ready, true, "Packaged Spring Boot application and fresh database must start");
const identity = await fetch(origin + "/api/session");
assert.equal(identity.status, 200);
const session = await identity.json();
assert.equal(session.member, null);
assert.equal(session.admin, false);
assert.ok(session.csrfToken);
const configuration = await fetch(origin + "/api/public/site");
assert.equal(configuration.status, 200);
const site = await configuration.json();
assert.equal(site.serviceName, "상태창");
assert.equal(site.imageMaxMiB, 10);
assert.equal(site.attachmentMaxMiB, 10);
const designs = await (await fetch(origin + "/api/public/designs")).json();
assert.deepEqual(designs.map((design) => design.id).sort(), ["google-flat", "hud", "modern-flat", "premium-dark", "swiss"]);
assert.ok(designs.every((design) => design.enabled && design.implemented));
assert.equal(designs.find((design) => design.isDefault).id, "swiss");
const protectedRoute = await fetch(origin + "/api/admin/overview", { redirect: "manual" });
assert.equal(protectedRoute.status, 401);
process.stdout.write("Packaged Kotlin backend passed fresh PostgreSQL migration, public settings and anonymous access checks.\n");
