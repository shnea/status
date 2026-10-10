import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";

test("cancelling image processing preserves the old image and retry reuses the upload request", async ({
  page,
}) => {
  await identity(page);
  let stored = initialDraft();
  const previous = "77777777-7777-4777-8777-777777777777";
  const next = "88888888-8888-4888-8888-888888888888";
  stored.document.profile.imageId = previous;
  let ready = false;
  const requests: string[] = [];

  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jIuoAAAAASUVORK5CYII=",
    "base64",
  );

  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT")
      stored = {
        ...stored,
        document: route.request().postDataJSON().document,
        revision: stored.revision + 1,
      };
    await route.fulfill({ json: stored });
  });
  await page.route("**/api/files", async (route) => {
    const requestId = route
      .request()
      .postData()
      ?.match(/name="requestId"\r?\n\r?\n([^\r\n]+)/)?.[1];

    if (!requestId) throw new Error("Request ID missing");
    requests.push(requestId);
    await route.fulfill({
      json: {
        fileId: next,
        scope: "11111111-1111-4111-8111-111111111111",
        kind: "image",
        name: "profile.png",
        size: image.length,
      },
    });
  });
  await page.route("**/api/files/*/views", (route) =>
    route.fulfill({
      json: {
        fileId: next,
        kind: "IMAGE",
        state: ready ? "READY" : "PROCESSING",
        previewUrl: "/api/files/" + next + "/content/preview",
      },
    }),
  );
  await page.route("**/api/files/*/content/preview", (route) =>
    route.fulfill({ contentType: "image/png", body: image }),
  );
  await page.goto("/dashboard");
  const field = page.getByRole("region", { name: "프로필 이미지", exact: true });
  await field
    .getByLabel("프로필 이미지 파일", { exact: true })
    .setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: image });
  await expect(field.getByRole("status")).toHaveText("이미지 처리 중");
  await expect(page.getByRole("button", { name: "임시저장", exact: true })).toBeDisabled();
  await field.getByRole("button", { name: "업로드 취소", exact: true }).click();
  await expect(field.getByRole("status")).toHaveText("업로드를 취소했습니다.");
  await expect(page.getByRole("button", { name: "임시저장", exact: true })).toBeEnabled();
  await expect(field.getByAltText("프로필 이미지", { exact: true })).toHaveAttribute(
    "src",
    "/api/files/" + previous + "/content/preview",
  );
  expect(stored.document.profile.imageId).toBe(previous);
  ready = true;
  await field.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(field.getByAltText("프로필 이미지", { exact: true })).toHaveAttribute(
    "src",
    "/api/files/" + next + "/content/preview",
  );
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(stored.document.profile.imageId).toBe(next);
});
