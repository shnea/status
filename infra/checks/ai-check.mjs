import { createServer, request as proxyRequest } from "node:http";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium, expect, devices } from "@playwright/test";
import { printFixture } from "./tests/fixtures/pdf.mjs";

const fixture = printFixture();
const view = { id: "11111111-1111-4111-8111-111111111111", slug: "ai-fixture", canonicalSlug: "ai-fixture", revision: fixture.revision, document: fixture.document, aiEnabled: true };
view.document.projects.push(
  { ...view.document.projects[0], id: "33333333-3333-4333-8333-333333333333", title: "두 번째 프로젝트" },
  { ...view.document.projects[0], id: "44444444-4444-4444-8444-444444444444", title: "세 번째 프로젝트" },
);
view.document.profile.title = "이름과 다른 메인 타이틀";
view.document.profile.bannerImageId = "banner-fixture";
view.document.skills = view.document.skills.map((skill) => ({ ...skill, featured: true, icon: { provider: "initials", key: "", hex: "", monochromeAllowed: false } }));
const calls = [];
const answers = new Map();
let cancelCalls = 0;
let submissionWaiting = false;
let releaseSubmission;
let csrfToken = "isolated-csrf";
const formattedAnswer = [
  "**Kotlin**과 **Spring Boot** 경험이 공개되어 있습니다.",
  "",
  "* **웹**: 서비스 개발",
  "* 데이터: PostgreSQL",
  "",
  "1. 요구사항 확인",
  "2. 구현",
  "",
  "인라인 코드: `val answer = true`",
  "",
  "```kotlin",
  "val message = \"" + "긴 코드".repeat(80) + "\"",
  "```",
  "",
  "[문서](https://example.test/docs)",
  "",
  "| 기술 | 용도 |",
  "| --- | --- |",
  "| Kotlin | 백엔드 |",
  "",
  "<script>window.__aiMarkdownScript = true</script>",
  "[실행](javascript:alert(1))",
  "![원격](https://example.test/tracker.png)",
].join("\n");
const stub = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/api/public/portfolios/ai-fixture") { response.end(JSON.stringify(view)); return; }
  if (request.url === "/api/public/portfolios/another-fixture") { response.end(JSON.stringify({ ...view, id: "55555555-5555-4555-8555-555555555555", slug: "another-fixture", canonicalSlug: "another-fixture" })); return; }
  if (request.url.startsWith("/api/public/files/")) { response.writeHead(200, { "Content-Type": "image/png" }).end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jIuoAAAAASUVORK5CYII=", "base64")); return; }
  if (request.url === "/api/session") { response.end(JSON.stringify({ member: null, admin: false, csrfToken })); return; }
  if (request.url.endsWith("/visit")) { response.end("{}"); return; }
  if (request.url === "/api/public/portfolios/ai-fixture/ai") {
    const parts = [];
    for await (const part of request) parts.push(part);
    const input = JSON.parse(Buffer.concat(parts).toString());
    assert.equal(request.headers["x-csrf-token"], csrfToken);
    calls.push(input);
    if (input.question === "접수 중 취소") {
      submissionWaiting = true;
      await new Promise((resolve) => { releaseSubmission = resolve; });
      submissionWaiting = false;
    }
    answers.set(input.requestId, { requestId: input.requestId, status: "completed", answer: formattedAnswer, sources: [{ id: "project", title: "상태창", url: "/@ai-fixture/projects/22222222-2222-4222-8222-222222222222" }] });
    if (input.question === "대기 중 취소") answers.set(input.requestId, { requestId: input.requestId, status: "pending", answer: null, sources: [] });
    if (input.question === "응답 유실") { response.writeHead(503).end(JSON.stringify({ message: "접수를 확인해주세요.", code: "UNCONFIRMED" })); return; }
    response.end(JSON.stringify({ requestId: input.requestId, status: "pending", answer: null, sources: [] })); return;
  }
  if (request.url.endsWith("/cancel")) {
    assert.equal(request.headers["x-csrf-token"], csrfToken);
    cancelCalls++;
    const id = request.url.split("/").at(-2);
    if (!answers.has(id)) { response.writeHead(404).end("{}"); return; }
    answers.set(id, { requestId: id, status: "completed", answer: "취소 뒤 도착한 답변", sources: [] });
    response.end(JSON.stringify({ requestId: id, status: "cancelling", answer: null, sources: [] }));
    return;
  }
  if (request.url.startsWith("/api/public/portfolios/ai-fixture/ai/")) {
    const id = request.url.split("/").at(-1);
    if (view.aiEnabled) response.end(JSON.stringify(answers.get(id)));
    else response.writeHead(403).end(JSON.stringify({ message: "AI 사용이 허용되지 않았습니다." }));
    return;
  }
  response.writeHead(404).end("{}");
});
const proxy = createServer((request, response) => {
  const upstream = proxyRequest({ hostname: "127.0.0.1", port: request.url.startsWith("/api/") ? 4001 : 3000,
    path: request.url, method: request.method, headers: request.headers }, (result) => {
      response.writeHead(result.statusCode, result.headers); result.pipe(response);
    });
  upstream.on("error", () => response.writeHead(502).end());
  request.pipe(upstream);
});
proxy.on("upgrade", (request, socket, head) => {
  const upgrade = proxyRequest({ hostname: "127.0.0.1", port: 3000, path: request.url, method: request.method, headers: request.headers });
  upgrade.on("upgrade", (response, remote, remoteHead) => {
    socket.write("HTTP/1.1 101 Switching Protocols\r\n" + response.rawHeaders.reduce((all, value, index) => all + value + (index % 2 === 0 ? ": " : "\r\n"), "") + "\r\n");
    if (head.length) remote.write(head);
    if (remoteHead.length) socket.write(remoteHead);
    remote.on("error", () => socket.destroy());
    socket.on("error", () => remote.destroy());
    socket.pipe(remote); remote.pipe(socket);
  });
  upgrade.on("error", () => socket.destroy()); upgrade.end();
});
let next;
let browser;
try {
  await new Promise((resolve) => stub.listen(4001, "127.0.0.1", resolve));
  await new Promise((resolve) => proxy.listen(4002, "127.0.0.1", resolve));
  next = spawn(process.execPath, ["/work/node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1"],
    { cwd: "/work", env: { ...process.env, BACKEND_URL: "http://127.0.0.1:4001", APP_PUBLIC_URL: "http://127.0.0.1:4002", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "inherit", "inherit"] });
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt++) {
    try { ready = (await fetch("http://127.0.0.1:4002/login", { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Isolated server readiness only. */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(ready, true);
  browser = await chromium.launch();
  for (const template of ["swiss", "hud", "google-flat", "modern-flat", "premium-dark"]) {
    view.document.template = template;
  for (const [name, options] of [["desktop", { viewport: { width: 1440, height: 1000 } }], ["mobile", devices["Pixel 7"]]]) {
    process.stdout.write("Checking AI: " + template + " / " + name + "\n");
    calls.length = 0; answers.clear(); cancelCalls = 0; view.aiEnabled = true; csrfToken = "isolated-csrf";
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      const publicPage = await page.goto("http://127.0.0.1:4002/@ai-fixture");
      if (publicPage.status() !== 200) await writeFile("/artifacts/ai/failed-route.html", await page.content());
      assert.equal(publicPage.status(), 200, "The actual public route must read the isolated fixture");
      const encodedPage = await page.goto("http://127.0.0.1:4002/%40ai-fixture");
      assert.equal(encodedPage.status(), 200);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://127.0.0.1:4002/@ai-fixture");
      const projectLink = page.locator("#projects article > a").first();
      const projectArea = page.locator("#projects article").first();
      const box = await projectArea.boundingBox();
      assert.ok(box);
      // Click visible card padding; rounded corners lie outside the painted card.
      await projectArea.click({ position: { x: box.width - 24, y: box.height - 12 } });
      const projectDialog = page.getByRole("dialog", { name: "프로젝트 상세" });
      await expect(projectDialog).toContainText("프로젝트 마지막 문단");
      await expect(page).toHaveURL(/\/projects\/22222222-2222-4222-8222-222222222222$/);
      await page.goBack();
      await expect(projectDialog).not.toBeVisible();
      await expect(projectLink).toBeFocused();
      await page.goForward();
      await expect(projectDialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(projectDialog).not.toBeVisible();
      await page.goto("http://127.0.0.1:4002/@ai-fixture/projects/" + view.document.projects[0].id);
      await expect(page.getByRole("heading", { level: 1, name: "상태창", exact: true })).toBeVisible();
      await expect(page.getByRole("main")).toContainText("프로젝트 마지막 문단");
      await page.getByRole("link", { name: "← 포트폴리오", exact: true }).click();
      const webLink = page.locator("#projects").getByRole("link", { name: /GitHub/ }).first();
      await expect(webLink).toHaveAttribute("href", "https://github.com/shnea/status");
      await expect(webLink).toHaveAttribute("target", "_blank");
      await expect(page.getByRole("heading", { level: 1, name: "이름과 다른 메인 타이틀", exact: true })).toBeVisible();
      const banner = page.getByRole("img", { name: "김상태 간판 이미지", exact: true });
      if (template === "swiss") await expect(banner).toHaveCount(0);
      else await expect(banner).toHaveAttribute("src", "/api/public/files/" + view.id + "/banner-fixture/content/preview");
      const launcher = page.getByRole("button", { name: "AI 채팅 열기", exact: true });
      await expect(launcher).toBeVisible();
      const launcherBox = await launcher.boundingBox();
      assert.ok(launcherBox.x > (await page.viewportSize()).width / 2);
      await page.mouse.click(launcherBox.x + launcherBox.width / 2, launcherBox.y + launcherBox.height / 2);
      const chat = page.getByRole("dialog", { name: "AI", exact: true });
      await expect(chat).toBeVisible();
      await expect.poll(async () => (await chat.boundingBox()).x).toBe(0);
      const chatBox = await chat.boundingBox();
      if (name === "mobile") {
        assert.equal(chatBox.width, page.viewportSize().width);
        await expect(chat).toHaveAttribute("aria-modal", "true");
        assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
      } else {
        assert.ok(chatBox.width < page.viewportSize().width / 2);
        await expect(chat).toHaveAttribute("aria-modal", "false");
        assert.equal(await page.evaluate(() => document.body.style.overflow), "");
        const previousScroll = await page.evaluate(() => window.scrollY);
        await page.mouse.move(1200, 600);
        await page.mouse.wheel(0, 500);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(previousScroll);
        await page.locator("#projects article").last().click();
        await expect(projectDialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(projectDialog).not.toBeVisible();
        await expect(chat).toBeVisible();
        const backgroundLink = page.locator("#projects article > a").last();
        await backgroundLink.focus();
        await expect(backgroundLink).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(projectDialog).toBeVisible();

        if (template === "swiss") {
          await page.setViewportSize({ width: 390, height: 844 });
          await expect(chat).toHaveAttribute("aria-modal", "true");
          await page.setViewportSize({ width: 1440, height: 1000 });
          await expect(chat).toHaveAttribute("aria-modal", "false");
          assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", "Resizing AI must preserve the project modal's scroll lock");
          await expect(projectDialog).toBeVisible();
          await expect(projectDialog.getByRole("button", { name: /닫기/ })).toBeFocused();
        }

        await page.keyboard.press("Escape");
        await expect(projectDialog).not.toBeVisible();
        await expect(chat).toBeVisible();

        if (template === "swiss") {
          await page.setViewportSize({ width: 390, height: 844 });
          await expect(chat).toHaveAttribute("aria-modal", "true");
          assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
          await page.setViewportSize({ width: 1440, height: 1000 });
          await expect(chat).toHaveAttribute("aria-modal", "false");
          assert.equal(await page.evaluate(() => document.body.style.overflow), "");
        }
      }
      await page.getByRole("button", { name: "AI 채팅 닫기", exact: true }).click();
      await expect(chat).not.toBeVisible();
      await expect(launcher).toBeFocused();
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");
      await page.mouse.click(launcherBox.x + launcherBox.width / 2, launcherBox.y + launcherBox.height / 2);
      await chat.getByRole("textbox", { name: "질문", exact: true }).fill("어떤 기술을 사용했나요?");
      await page.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(page.getByRole("log")).toContainText("Kotlin과 Spring Boot 경험");
      await expect(page.getByRole("navigation", { name: "검색 근거" }).getByRole("link")).toHaveAttribute("href", "/@ai-fixture/projects/22222222-2222-4222-8222-222222222222");
      const firstAnswer = chat.locator('[data-role="assistant"]').first();
      await expect(firstAnswer.locator("strong").first()).toHaveText("Kotlin");
      await expect(firstAnswer.getByRole("list")).toHaveCount(2);
      await expect(firstAnswer.locator("pre code")).toContainText("val message");
      await expect(firstAnswer.getByRole("table")).toContainText("백엔드");
      await expect(firstAnswer.getByRole("link", { name: "문서", exact: true })).toHaveAttribute("href", "https://example.test/docs");
      await expect(firstAnswer.getByRole("link", { name: "실행", exact: true })).not.toHaveAttribute("href", /^javascript:/i);
      await expect(firstAnswer.locator("script, img")).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.__aiMarkdownScript), undefined);
      assert.equal(await chat.getByRole("log").evaluate((element) => element.scrollWidth <= element.clientWidth), true);
      await page.screenshot({ path: "/artifacts/ai/" + template + "-" + name + "-conversation.png" });
      const userMessage = await chat.locator('[data-role="user"]').first().boundingBox();
      const aiMessage = await chat.locator('[data-role="assistant"]').first().boundingBox();
      assert.ok(userMessage.x > aiMessage.x);
      if (name === "mobile") {
        await chat.getByRole("textbox", { name: "질문", exact: true }).fill("아직 보내지 않은 질문");
        await chat.getByRole("navigation", { name: "검색 근거" }).getByRole("link").click();
        await expect(page).toHaveURL(/\/projects\/22222222-2222-4222-8222-222222222222$/);
        await page.goBack();
        await expect(page).toHaveURL("http://127.0.0.1:4002/@ai-fixture");
        await expect(page.getByRole("heading", { level: 1, name: "이름과 다른 메인 타이틀", exact: true })).toBeVisible();
        await expect(launcher).toBeVisible();
        await page.reload();
        await expect(launcher).toBeVisible();
        const restoredButton = await launcher.boundingBox();
        await page.mouse.click(restoredButton.x + restoredButton.width / 2, restoredButton.y + restoredButton.height / 2);
        await expect(chat.getByRole("log")).toContainText("어떤 기술을 사용했나요?");
        await expect(chat.getByRole("log")).toContainText("Kotlin과 Spring Boot 경험");
        await expect(chat.getByRole("textbox", { name: "질문", exact: true })).toHaveValue("아직 보내지 않은 질문");
        assert.equal(calls.length, 1, "Restoring a conversation must not rerun the model");

        if (template === "swiss") {
          await page.goto("http://127.0.0.1:4002/@another-fixture");
          await expect(launcher).toBeVisible();
          const otherButton = await launcher.boundingBox();
          await page.mouse.click(otherButton.x + otherButton.width / 2, otherButton.y + otherButton.height / 2);
          await expect(chat.getByRole("log")).toBeEmpty();
          await expect(chat.getByRole("textbox", { name: "질문", exact: true })).toHaveValue("");
          await page.goBack();
          await expect(page).toHaveURL("http://127.0.0.1:4002/@ai-fixture");
          await expect(page.getByRole("heading", { level: 1, name: "이름과 다른 메인 타이틀", exact: true })).toBeVisible();
          await page.reload();
          await expect(page).toHaveURL("http://127.0.0.1:4002/@ai-fixture");
          await expect(chat).toBeVisible();
          await expect(chat.getByRole("log")).toContainText("어떤 기술을 사용했나요?");
          await expect(chat.getByRole("textbox", { name: "질문", exact: true })).toHaveValue("아직 보내지 않은 질문");
          assert.equal(calls.length, 1);
        }
      }
      await chat.getByRole("textbox", { name: "질문", exact: true }).fill("그 경험은?");
      await page.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(page.getByRole("log").getByText("Kotlin과 Spring Boot 경험이 공개되어 있습니다.", { exact: true })).toHaveCount(2);
      assert.equal(calls[1].messages.length, 2);
      await page.getByRole("button", { name: "새 대화", exact: true }).click();
      await chat.getByRole("textbox", { name: "질문", exact: true }).fill("응답 유실");
      await page.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(chat.getByRole("alert")).toHaveText("접수를 확인해주세요.");
      if (template === "swiss" && name === "mobile") await page.reload();
      else await page.getByRole("button", { name: "상태 확인", exact: true }).click();
      await expect(page.getByRole("log")).toContainText("Kotlin과 Spring Boot 경험");
      assert.equal(calls.length, 3, "Recovery must not resubmit the model request");
      await page.getByRole("button", { name: "새 대화", exact: true }).click();
      await chat.getByRole("textbox", { name: "질문", exact: true }).fill("대기 중 취소");
      await page.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(chat.getByRole("status")).toContainText("답변 대기 중…");
      await page.getByRole("button", { name: "취소", exact: true }).click();
      await expect(chat.getByRole("log")).toContainText("답변 대기를 취소했습니다.");
      await expect(chat.getByRole("log")).not.toContainText("취소 뒤 도착한 답변");
      assert.equal(cancelCalls, 1);
      assert.equal(calls.length, 4);
      await page.getByRole("button", { name: "새 대화", exact: true }).click();
      await chat.getByRole("textbox", { name: "질문", exact: true }).fill("접수 중 취소");
      await page.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect.poll(() => submissionWaiting).toBe(true);
      await page.getByRole("button", { name: "취소", exact: true }).click();
      await expect.poll(() => cancelCalls).toBe(2);
      releaseSubmission();
      await expect(chat.getByRole("log")).toContainText("답변 대기를 취소했습니다.");
      await expect(chat.getByRole("log")).not.toContainText("취소 뒤 도착한 답변");
      assert.equal(cancelCalls, 3, "An unreserved ID is cancelled again after the original POST returns");
      assert.equal(calls.length, 5, "Cancelling an in-flight submission must not start a second model request");
      await page.getByRole("button", { name: "새 대화", exact: true }).click();
      if (template === "swiss" && name === "mobile") {
        await chat.getByRole("textbox", { name: "질문", exact: true }).fill("이전 방문의 질문");
        await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith("status-ai:11111111") && JSON.parse(sessionStorage.getItem(key)).question === "이전 방문의 질문"))).toBe(true);
        csrfToken = "new-isolated-visitor";
        await page.reload();
        await expect(launcher).toBeVisible();
        const newVisitorButton = await launcher.boundingBox();
        await page.mouse.click(newVisitorButton.x + newVisitorButton.width / 2, newVisitorButton.y + newVisitorButton.height / 2);
        await expect(chat.getByRole("log")).toBeEmpty();
        await expect(chat.getByRole("textbox", { name: "질문", exact: true })).toHaveValue("");
        await page.evaluate(() => {
          for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith("status-ai:11111111")) sessionStorage.setItem(key, '{"version":1}');
          }
        });
        await page.reload();
        await expect(launcher).toBeVisible();
        const cleanButton = await launcher.boundingBox();
        await page.mouse.click(cleanButton.x + cleanButton.width / 2, cleanButton.y + cleanButton.height / 2);
        await expect(chat.getByRole("log")).toBeEmpty();
        assert.equal(calls.length, 5, "A new visitor or invalid stored data must not rerun the model");
      }
      await chat.getByRole("textbox", { name: "질문", exact: true }).fill("권한 철회 중 질문");
      view.aiEnabled = false;
      await page.getByRole("button", { name: "질문하기", exact: true }).click();
      await expect(chat.getByRole("alert")).toHaveText("AI 사용이 허용되지 않았습니다.");
      await expect(page.getByRole("button", { name: "질문하기", exact: true })).toBeDisabled();
      await expect(page.getByRole("log")).not.toContainText("Kotlin과 Spring Boot 경험");
      assert.equal(errors.length, 0, "The actual public component must render without runtime exceptions");
      await page.screenshot({ path: "/artifacts/ai/" + template + "-" + name + ".png" });
      await page.reload();
      await expect(page.getByRole("button", { name: "AI 채팅 열기", exact: true })).toHaveCount(0);
    } catch (error) { process.stdout.write("Isolated public UI runtime errors: " + JSON.stringify(errors) + "\n"); await page.screenshot({ path: "/artifacts/ai/failed-ui.png", fullPage: true }); throw error; } finally { await context.close(); }
  }
  }
  process.stdout.write("All five templates: AI public UI passed desktop/mobile conversation, CSRF, source link, uncertain recovery, fixed robot launcher, nonmodal desktop background click/scroll/keyboard and responsive modal transitions, fullscreen mobile chat, message alignment, cancellation before reservation and with late-result suppression, mobile source navigation/reload restoration, portfolio/visitor storage isolation, pending request restoration without resubmission, invalid storage recovery, safe Markdown, banner/title and revoked-permission checks.\n");
} finally {
  await browser?.close();
  next?.kill("SIGTERM");
  stub.closeAllConnections(); stub.close();
  proxy.closeAllConnections(); proxy.close();
}
