import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";

test("public address is fixed and AI settings are absent before admin permission", async ({
  page,
}) => {
  await identity(page);
  const stored = initialDraft();
  await page.route("**/api/portfolio", (route) => route.fulfill({ json: stored }));
  await page.goto("/dashboard");
  await expect(page.getByLabel("공유 주소", { exact: true })).toHaveCount(0);
  await expect(page.getByText("/@ui-writer", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "07 AI 관리", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "06 설정", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "공개 포트폴리오에서 AI 사용" })).toHaveCount(0);
});

test("allowed author controls AI from settings and failures preserve the checkbox and draft", async ({
  page,
}) => {
  await identity(page);
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        member: {
          id: "11111111-1111-4111-8111-111111111111",
          displayName: "작성자",
          aiAllowed: true,
          suspended: false,
        },
        admin: false,
        csrfToken: "ui-test-csrf",
      },
    }),
  );
  let stored = initialDraft();
  let attempts = 0;
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON();
      stored = { ...stored, document: input.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });
  await page.route("**/api/portfolio/ai-consent", async (route) => {
    attempts += 1;

    if (attempts === 1) {
      await route.fulfill({ status: 503, json: { message: "설정 저장 실패" } });

      return;
    }

    stored = { ...stored, aiConsent: route.request().postDataJSON().enabled };
    await route.fulfill({ json: stored });
  });
  await page.goto("/dashboard");
  await page.getByLabel("메인 타이틀", { exact: true }).fill("나만의 메인 타이틀");
  await page.getByRole("button", { name: "06 설정", exact: true }).click();
  const enabled = page.getByRole("checkbox", { name: "공개 포트폴리오에서 AI 사용" });
  await expect(enabled).not.toBeChecked();
  await enabled.click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("설정 저장 실패");
  await expect(enabled).not.toBeChecked();
  expect(stored.document.profile.title).toBe("나만의 메인 타이틀");
  await enabled.click();
  await expect(enabled).toBeChecked();
  await page.getByRole("button", { name: "07 AI 관리", exact: true }).click();
  await expect(enabled).toBeChecked();
  await enabled.click();
  await expect(enabled).not.toBeChecked();
  expect(stored.aiConsent).toBe(false);
});

test("separate banner upload and main title persist through all templates", async ({ page }) => {
  await identity(page);
  let stored = initialDraft();
  const banner = "88888888-8888-4888-8888-888888888888";

  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jIuoAAAAASUVORK5CYII=",
    "base64",
  );

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
  await page.route("**/api/files", (route) =>
    route.fulfill({
      json: {
        fileId: banner,
        scope: "11111111-1111-4111-8111-111111111111",
        kind: "image",
        name: "banner.png",
        size: image.length,
      },
    }),
  );
  await page.route("**/api/files/*/views", (route) =>
    route.fulfill({
      json: {
        state: "READY",
        kind: "IMAGE",
        previewUrl: "/api/files/" + banner + "/content/preview",
      },
    }),
  );
  await page.route("**/api/files/*/content/preview", (route) =>
    route.fulfill({ contentType: "image/png", body: image }),
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "간판 이미지", exact: true })).toHaveCount(0);
  await page.getByLabel("메인 타이틀", { exact: true }).fill("이름과 다른 큰 제목");
  await page.getByRole("button", { name: "06 설정", exact: true }).click();
  await page.getByRole("combobox", { name: "디자인", exact: true }).selectOption("hud");
  await page.getByRole("button", { name: "01 프로필", exact: true }).click();
  const upload = page.getByRole("region", { name: "간판 이미지", exact: true });
  await upload
    .getByLabel("간판 이미지 파일", { exact: true })
    .setInputFiles({ name: "banner.png", mimeType: "image/png", buffer: image });
  await expect(upload.getByAltText("간판 이미지", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(stored.document.profile.imageId).toBeNull();
  expect(stored.document.profile.bannerImageId).toBe(banner);

  for (const template of ["google-flat", "modern-flat", "premium-dark", "swiss"]) {
    await page.getByRole("button", { name: "06 설정", exact: true }).click();
    await page.getByRole("combobox", { name: "디자인", exact: true }).selectOption(template);
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    await page.getByRole("button", { name: "01 프로필", exact: true }).click();

    if (template === "swiss") await expect(upload).toHaveCount(0);
    else await expect(upload.getByAltText("간판 이미지", { exact: true })).toBeVisible();
    expect(stored.document.profile.bannerImageId).toBe(banner);
    expect(stored.document.profile.title).toBe("이름과 다른 큰 제목");
    expect(stored.slug).toBe("ui-writer");
  }

  await page.getByRole("button", { name: "06 설정", exact: true }).click();
  await page.getByRole("combobox", { name: "디자인", exact: true }).selectOption("premium-dark");
  await page.getByRole("button", { name: "미리보기 ↗", exact: true }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByRole("heading", { level: 1, name: "이름과 다른 큰 제목" })).toBeVisible();
  await expect(page.getByRole("img", { name: "작성자 간판 이미지", exact: true })).toHaveAttribute(
    "src",
    "/api/files/" + banner + "/content/preview",
  );
});
