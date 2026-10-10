import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";

test("platform editor saves formatted self introduction and previews the saved draft", async ({
  page,
}) => {
  await identity(page);
  let stored = initialDraft();

  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      expect(route.request().headers()["x-csrf-token"]).toBe("ui-test-csrf");
      const body = route.request().postDataJSON();
      expect(body.revision).toBe(stored.revision);
      stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });

  await page.goto("/dashboard");
  const editor = page.getByRole("textbox", { name: "자기소개", exact: true });
  await expect(editor).toBeVisible();
  await page.getByLabel("한 줄 소개", { exact: true }).fill("백엔드 개발자");
  await editor.fill("차분하게 문제를 해결합니다.");
  await editor.press("Enter");
  await editor.press("Control+b");
  await editor.pressSequentially("기술과 경험을 기록합니다.");
  await editor.press("Control+b");
  await expect(editor.locator("strong")).toHaveText("기술과 경험을 기록합니다.");
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(stored.document.profile.introduction).toBe("백엔드 개발자");
  expect(stored.document.profile.about?.format).toBe("shnea-editor");
  expect(stored.document.profile.about?.version).toBe(3);

  await page.screenshot({
    path: "/artifacts/profile-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "미리보기 ↗" }).click();
  await expect(page).toHaveURL(/\/preview$/);
  const about = page.getByRole("region", { name: "자기소개", exact: true });
  await expect(about.locator("strong")).toHaveText("기술과 경험을 기록합니다.");
  await expect(about.locator("p").first()).toHaveText("차분하게 문제를 해결합니다.");
  await page.getByRole("link", { name: "작성 화면으로 ↗" }).click();
  await expect(editor).toContainText("기술과 경험을 기록합니다.");
  await expect(page.getByLabel("한 줄 소개", { exact: true })).toHaveValue("백엔드 개발자");
});

test("editing during an in-flight save is preserved and saved next", async ({ page }) => {
  await identity(page);
  let stored = initialDraft();
  let writes = 0;

  let release: () => void = () => {
    throw new Error("Save gate has not initialized");
  };

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      writes += 1;

      if (writes === 1) await gate;
      expect(body.revision).toBe(stored.revision);
      stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });

  await page.goto("/dashboard");
  const editor = page.getByRole("textbox", { name: "자기소개", exact: true });
  await expect(editor).toBeVisible();
  await editor.fill("저장 중 첫 문장");

  const request = page.waitForRequest(
    (next) => next.url().endsWith("/api/portfolio") && next.method() === "PUT",
  );

  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await request;
  await editor.fill("저장 중에도 새 문장을 작성합니다.");
  release();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  await expect(editor).toHaveText("저장 중에도 새 문장을 작성합니다.");
  expect(writes).toBe(2);
  expect(JSON.stringify(stored.document.profile.about)).toContain(
    "저장 중에도 새 문장을 작성합니다.",
  );
});

test("a late draft save cannot revert the displayed private publication state", async ({
  page,
}) => {
  await identity(page);
  let stored = { ...initialDraft(), isPublic: true, publishedRevision: 0 };

  let release: () => void = () => {
    throw new Error("Save gate has not initialized");
  };

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.fulfill({ json: stored });

      return;
    }

    const body = route.request().postDataJSON();
    stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    const savedBeforeUnpublish = structuredClone(stored);
    await gate;
    await route.fulfill({ json: savedBeforeUnpublish });
  });
  await page.route("**/api/portfolio/unpublish", async (route) => {
    stored = { ...stored, isPublic: false };
    await route.fulfill({ json: stored });
  });

  await page.goto("/dashboard");
  await page.getByLabel("한 줄 소개", { exact: true }).fill("새 초안");
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("저장 중");
  await page.getByRole("button", { name: "비공개", exact: true }).click();
  await expect(page.getByRole("button", { name: "비공개", exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  await expect(page.getByRole("button", { name: "비공개", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("한 줄 소개", { exact: true })).toHaveValue("새 초안");
  await expect(page.getByText("비공개", { exact: true })).toBeVisible();
  expect(stored.isPublic).toBe(false);
});

test("a save conflict preserves editor input and prevents automatic overwrites", async ({
  page,
}) => {
  await identity(page);
  const stored = initialDraft();
  let writes = 0;
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      writes += 1;
      await route.fulfill({ status: 409, json: { message: "다른 탭에서 변경했습니다." } });
    } else {
      await route.fulfill({ json: stored });
    }
  });
  await page.goto("/dashboard");
  const editor = page.getByRole("textbox", { name: "자기소개", exact: true });
  await expect(editor).toBeVisible();
  await editor.fill("이 탭에서 작성한 자기소개");
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("수정 충돌");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "다른 탭에서 변경했습니다.",
  );
  await editor.fill("충돌 후에도 입력을 보관합니다.");
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(editor).toHaveText("충돌 후에도 입력을 보관합니다.");
  expect(writes).toBe(1);
});
