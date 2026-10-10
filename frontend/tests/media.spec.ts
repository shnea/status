import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { identity, initialDraft } from "./fixtures/workspace";

const owner = "11111111-1111-4111-8111-111111111111";

const files = [
  {
    name: "clip.mp4",
    kind: "video",
    viewKind: "VIDEO",
    mime: "video/mp4",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
  {
    name: "clip.wav",
    kind: "audio",
    viewKind: "AUDIO",
    mime: "audio/wav",
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  },
  {
    name: "fixture.pdf",
    kind: "file",
    viewKind: "PDF",
    mime: "application/pdf",
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  },
  {
    name: "fixture.md",
    kind: "file",
    viewKind: "MARKDOWN",
    mime: "text/markdown",
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  },
];

test("editor attachments play actual audio and HLS fixtures and open protected PDF and text previews", async ({
  page,
}) => {
  await identity(page);
  let stored = initialDraft();
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      stored = {
        ...stored,
        document: route.request().postDataJSON().document,
        revision: stored.revision + 1,
      };
    }

    await route.fulfill({ json: stored });
  });
  await page.route("**/api/files", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("ui-test-csrf");
    const body = route.request().postDataBuffer()?.toString("latin1") || "";
    const file = files.find((item) => body.includes('filename="' + item.name + '"'));

    if (!file) throw new Error("Unknown fixture upload");

    if (file.kind === "video") await new Promise((resolve) => setTimeout(resolve, 750));
    const bytes = await readFile("/artifacts/media/" + file.name);
    await route.fulfill({
      json: { fileId: file.id, name: file.name, size: bytes.length, kind: file.kind, scope: owner },
    });
  });
  await page.route("**/api/files/*/views", async (route) => {
    const file = files.find((item) => route.request().url().includes(item.id));

    if (!file) throw new Error("Unknown fixture view");
    const base = "/api/files/" + file.id;
    await route.fulfill({
      json: {
        fileId: file.id,
        name: file.name,
        mediaType: file.mime,
        kind: file.viewKind,
        state: "READY",
        previewUrl: base + "/content/preview",
        thumbnailUrl: null,
        originalUrl: base + "/content/original",
        viewerUrl: "/file-viewer/" + file.id,
        downloadUrl: base + "/content/download",
        expiresAt: null,
        streamUrl: file.kind === "video" ? base + "/hls/master.m3u8" : null,
        video: file.kind === "video" ? { state: "READY", progress: 100 } : null,
      },
    });
  });
  await page.route("**/api/files/*/content/*", async (route) => {
    const file = files.find((item) => route.request().url().includes(item.id));

    if (!file) throw new Error("Unknown fixture content");
    await route.fulfill({
      contentType: file.mime,
      body: await readFile("/artifacts/media/" + file.name),
    });
  });
  await page.route("**/api/files/*/hls/*", async (route) => {
    const asset = new URL(route.request().url()).pathname.split("/hls/")[1];

    if (!/^(master\.m3u8|q360\.m3u8|q360-\d{5}\.ts)$/.test(asset))
      throw new Error("Unexpected HLS asset");
    await route.fulfill({
      contentType: asset.endsWith(".ts") ? "video/mp2t" : "application/vnd.apple.mpegurl",
      body: await readFile("/artifacts/media/" + asset),
    });
  });

  const clipboard = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mime: file.mime,
      bytes: (await readFile("/artifacts/media/" + file.name)).toString("base64"),
    })),
  );

  await page.goto("/dashboard");
  const editor = page.getByRole("textbox", { name: "자기소개", exact: true });
  await editor.fill("본문 첨부");
  await editor.evaluate((element, payload) => {
    const transfer = new DataTransfer();

    for (const file of payload) {
      const bytes = Uint8Array.from(atob(file.bytes), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], file.name, { type: file.mime }));
    }

    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  }, clipboard);
  await expect(page.getByRole("button", { name: "임시저장", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "clip.mp4 영상 재생", exact: true }).click();
  const video = page.locator("video");
  await expect
    .poll(() =>
      video.evaluate((element) => (element instanceof HTMLMediaElement ? element.duration : 0)),
    )
    .toBeGreaterThan(0);
  const audio = page.locator("audio");
  await expect
    .poll(() =>
      audio.evaluate((element) => (element instanceof HTMLMediaElement ? element.duration : 0)),
    )
    .toBeGreaterThan(0);
  await audio.evaluate(async (element) => {
    if (!(element instanceof HTMLMediaElement)) throw new Error("Audio is unavailable");
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() =>
      audio.evaluate((element) => (element instanceof HTMLMediaElement ? element.currentTime : 0)),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");

  for (const file of files)
    expect(JSON.stringify(stored.document.profile.about)).toContain(file.id);
  expect(JSON.stringify(stored.document.profile.about)).not.toContain("/content/");
  await page
    .getByRole("region", { name: "fixture.pdf 첨부", exact: true })
    .getByRole("button", { name: "미리보기", exact: true })
    .click();
  const pdf = page.frameLocator('iframe[title="fixture.pdf 미리보기"]');
  await expect(pdf.getByRole("heading", { name: "fixture.pdf", exact: true })).toBeVisible();
  await expect(pdf.locator('iframe[title="fixture.pdf PDF"]')).toHaveAttribute(
    "src",
    /\/content\/original$/,
  );
  await page
    .getByRole("region", { name: "fixture.md 첨부", exact: true })
    .getByRole("button", { name: "미리보기", exact: true })
    .click();
  const markdown = page.frameLocator('iframe[title="fixture.md 미리보기"]');
  await expect(markdown.locator("pre")).toContainText('<script>alert("fixture")</script>');
  await expect(markdown.locator("pre script")).toHaveCount(0);
  await page.screenshot({
    path: "/artifacts/media-" + test.info().project.name + ".png",
    fullPage: true,
  });
});

test("public file viewers discard media when current access is withdrawn", async ({ page }) => {
  const file = files[1];
  const portfolio = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  let withdrawn = false;
  await page.route("**/api/public/files/*/*/views", async (route) => {
    if (withdrawn) {
      await route.fulfill({ status: 404, json: { message: "파일을 찾을 수 없습니다." } });

      return;
    }

    const base = "/api/public/files/" + portfolio + "/" + file.id;
    await route.fulfill({
      json: {
        fileId: file.id,
        name: file.name,
        mediaType: file.mime,
        kind: "AUDIO",
        state: "READY",
        previewUrl: base + "/content/preview",
        thumbnailUrl: null,
        originalUrl: base + "/content/original",
        viewerUrl: "/file-viewer/" + file.id + "?portfolioId=" + portfolio,
        downloadUrl: base + "/content/download",
        expiresAt: null,
      },
    });
  });
  await page.route("**/api/public/files/*/*/content/*", async (route) => {
    await route.fulfill({
      contentType: file.mime,
      body: await readFile("/artifacts/media/" + file.name),
    });
  });
  await page.goto("/file-viewer/" + file.id + "?portfolioId=" + portfolio);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator("audio")).toBeVisible();
  withdrawn = true;
  await page.getByRole("button", { name: "다시 조회", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("파일을 찾을 수 없습니다.");
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "다운로드", exact: true })).toHaveCount(0);
});
