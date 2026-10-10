import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";

test("PDF export saves first, keeps options on failure and downloads the selected revision", async ({
  page,
}) => {
  await identity(page);
  let stored = { ...initialDraft(), publishedRevision: 0 };
  const requests: { version: string; revision: number; includeProjectDetails: boolean }[] = [];
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT")
      stored = {
        ...stored,
        document: route.request().postDataJSON().document,
        revision: stored.revision + 1,
      };
    await route.fulfill({ json: stored });
  });
  await page.route("**/api/portfolio/pdf", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("ui-test-csrf");
    requests.push(route.request().postDataJSON());

    if (requests.length === 1) {
      await route.fulfill({
        status: 503,
        json: { message: "PDF 생성 서비스에 연결하지 못했습니다." },
      });

      return;
    }

    // Download interaction only; actual PDF rendering is checked by the isolated Docker pdf-check.
    await route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\nUI-download-fixture" });
  });
  await page.goto("/dashboard");
  await page.getByLabel("표시 이름", { exact: true }).fill("PDF 작성자");
  await page.getByRole("button", { name: "PDF 내보내기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "PDF 내보내기", exact: true });
  await dialog.getByLabel("프로젝트 상세 내용 포함", { exact: true }).check();
  await dialog.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("PDF 생성 서비스에 연결하지 못했습니다.");
  expect(stored.document.profile.name).toBe("PDF 작성자");
  expect(requests[0]).toEqual({
    version: "draft",
    revision: stored.revision,
    includeProjectDetails: true,
  });
  await expect(dialog.getByLabel("프로젝트 상세 내용 포함", { exact: true })).toBeChecked();
  await dialog.getByRole("combobox", { name: "출력 버전", exact: true }).selectOption("published");
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "PDF 다운로드", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe("ui-writer.pdf");
  expect(requests[1]).toEqual({ version: "published", revision: 0, includeProjectDetails: true });
  await expect(dialog).not.toBeVisible();
});
