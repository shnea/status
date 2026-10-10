import { expect, test, type Page } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";
import type { AttachmentViews } from "@shnea/editor";

async function imagePayload(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d");

    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#b44228";
    context.fillRect(0, 0, 32, 32);

    return canvas.toDataURL("image/png").split(",")[1];
  });
}

test("image upload retries reuse the request and paste/drop keep the draft protected", async ({
  page,
}) => {
  await identity(page);
  let stored = initialDraft();

  const payload = await imagePayload(page);
  const image = Buffer.from(payload, "base64");
  const fileId = "88888888-8888-4888-8888-888888888888";

  const views: AttachmentViews = {
    fileId,
    kind: "IMAGE",
    state: "READY",
    expiresAt: null,
    originalUrl: "/api/files/" + fileId + "/content/original",
    previewUrl: "/api/files/" + fileId + "/content/preview",
    thumbnailUrl: "/api/files/" + fileId + "/content/thumbnail",
    viewerUrl: "/api/files/" + fileId + "/content/preview",
    downloadUrl: "/api/files/" + fileId + "/content/download",
  };

  const requests: string[] = [];

  let release: () => void = () => {
    throw new Error("Upload gate not initialized");
  };

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });
  await page.route("**/api/files", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("ui-test-csrf");
    expect(route.request().headers()["x-platform-key"]).toBeUndefined();
    const body = route.request().postData() || "";
    const match = body.match(/name="requestId"\r?\n\r?\n([^\r\n]+)/);

    if (!match) throw new Error("Multipart request ID missing");
    requests.push(match[1]);

    if (requests.length === 1) {
      await route.fulfill({ status: 503, json: { message: "일시적 연결 실패" } });

      return;
    }

    if (requests.length === 2) await gate;
    await route.fulfill({
      json: {
        fileId,
        scope: "11111111-1111-4111-8111-111111111111",
        kind: "image",
        name: "profile.png",
        size: image.length,
      },
    });
  });
  await page.route("**/api/files/*/views", (route) => route.fulfill({ json: views }));
  await page.context().route("**/api/files/*/content/*", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: image,
    }),
  );
  await page.goto("/dashboard");
  const field = page.getByRole("region", { name: "프로필 이미지", exact: true });
  await field.getByLabel("프로필 이미지 파일", { exact: true }).setInputFiles({
    name: "profile.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(field.getByRole("alert")).toHaveText("일시적 연결 실패");
  await field.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("button", { name: "공개 반영", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "임시저장", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "02 스킬", exact: true })).toBeDisabled();
  release();
  await expect(field.getByAltText("프로필 이미지", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "공개 반영", exact: true })).toBeEnabled();
  expect(requests[0]).toBe(requests[1]);
  const area = field.getByRole("group", { name: "프로필 이미지 드롭 · 붙여넣기", exact: true });

  for (const type of ["paste", "drop"]) {
    await area.evaluate(
      (element, data) => {
        const bytes = Uint8Array.from(atob(data.payload), (character) => character.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], "profile.png", { type: "image/png" }));

        const event =
          data.type === "paste"
            ? new ClipboardEvent("paste", {
                clipboardData: transfer,
                bubbles: true,
                cancelable: true,
              })
            : new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true });

        element.dispatchEvent(event);
      },
      { payload, type },
    );
    await expect(page.getByRole("button", { name: "임시저장", exact: true })).toBeEnabled();
  }

  await expect.poll(() => requests.length).toBe(4);
  expect(new Set(requests).size).toBe(3);
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(stored.document.profile.imageId).toBe(fileId);
  await field.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(field.getByAltText("프로필 이미지", { exact: true })).toHaveCount(0);
});

test("platform editor image attachments retain IDs and use separate preview and original paths", async ({
  page,
}) => {
  await identity(page);
  let stored = initialDraft();
  const payload = await imagePayload(page);
  const image = Buffer.from(payload, "base64");
  const fileId = "99999999-9999-4999-8999-999999999999";
  const variants: string[] = [];
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });
  await page.route("**/api/files", (route) =>
    route.fulfill({
      json: {
        fileId,
        scope: "11111111-1111-4111-8111-111111111111",
        kind: "image",
        name: "editor.png",
        size: image.length,
      },
    }),
  );
  await page.route("**/api/files/*/views", (route) =>
    route.fulfill({
      json: {
        fileId,
        kind: "IMAGE",
        state: "READY",
        expiresAt: null,
        originalUrl: "/api/files/" + fileId + "/content/original",
        previewUrl: "/api/files/" + fileId + "/content/preview",
        thumbnailUrl: "/api/files/" + fileId + "/content/thumbnail",
        viewerUrl: "/api/files/" + fileId + "/content/preview",
        downloadUrl: "/api/files/" + fileId + "/content/download",
      },
    }),
  );
  await page.context().route("**/api/files/*/content/*", (route) => {
    variants.push(route.request().url().split("/content/")[1]);

    return route.fulfill({ contentType: "image/png", body: image });
  });
  await page.goto("/dashboard");
  const editor = page.getByRole("textbox", { name: "자기소개", exact: true });
  await expect(editor).toBeVisible();
  await editor.fill("이미지와 함께 작성하는 자기소개");
  await editor.evaluate((element, base64) => {
    const transfer = new DataTransfer();
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    transfer.items.add(new File([bytes], "editor.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  }, payload);
  await expect(
    page.getByRole("button", { name: "editor.png 확대 보기", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(JSON.stringify(stored.document.profile.about)).toContain(fileId);
  await page.getByRole("button", { name: "미리보기 ↗" }).click();
  await page.getByRole("button", { name: "editor.png 확대 보기", exact: true }).click();
  const zoom = page.getByRole("dialog", { name: "editor.png 이미지 확대 보기", exact: true });
  await expect(zoom).toBeVisible();
  expect(variants).toContain("preview");
  await expect(zoom.getByRole("link", { name: "원본 보기", exact: true })).toHaveAttribute(
    "href",
    new RegExp("/api/files/" + fileId + "/content/original$"),
  );
  const opened = page.context().waitForEvent("page");
  await zoom.getByRole("link", { name: "원본 보기", exact: true }).click();
  const original = await opened;
  await original.waitForLoadState();
  expect(variants).toContain("original");
  await original.close();
  await zoom.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(zoom).not.toBeVisible();
});
