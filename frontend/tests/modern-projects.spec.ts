import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";
import { swissSample } from "../src/features/templates/swiss/sample";

test("Modern browses projects one at a time and offers the complete list without hidden entries", async ({
  page,
}) => {
  await identity(page);
  const draft = initialDraft();
  draft.document = structuredClone(swissSample);
  draft.document.template = "modern-flat";
  draft.document.projects = Array.from({ length: 8 }, (_, index) => ({
    ...structuredClone(swissSample.projects[0]),
    id: "modern-project-" + index,
    title: "프로젝트 " + (index + 1),
    visible: index !== 2,
  }));
  draft.document.projects[0].links = [
    {
      id: "external",
      type: "web",
      label: "외부 문서",
      value: "https://example.test/modern-project",
      icon: "globe",
      visible: true,
    },
  ];
  await page.route("**/api/portfolio", (route) => route.fulfill({ json: draft }));
  await page
    .context()
    .route("https://example.test/**", (route) =>
      route.fulfill({ body: "External project document" }),
    );
  await page.goto("/preview");
  const desktop = test.info().project.name === "desktop";
  const visible = desktop ? 3 : 1;
  const range = page.getByRole("status", { name: "프로젝트 표시 범위" });
  const next = page.getByRole("button", { name: "다음 프로젝트" });
  const previous = page.getByRole("button", { name: "이전 프로젝트" });

  await expect(range).toHaveText(desktop ? "1–3 / 7" : "1 / 7");
  await expect(previous).toBeDisabled();
  await expect(page.locator("#projects article")).toHaveCount(7);
  await expect(page.locator("#projects")).not.toContainText("프로젝트 3");
  await expect(page.locator("#projects article h3")).toHaveText([
    "프로젝트 1",
    "프로젝트 2",
    "프로젝트 4",
    "프로젝트 5",
    "프로젝트 6",
    "프로젝트 7",
    "프로젝트 8",
  ]);

  for (let first = 2; first <= 8 - visible; first++) {
    await next.click();
    await expect(range).toHaveText(
      (visible === 1 ? String(first) : first + "–" + (first + visible - 1)) + " / 7",
    );
  }

  await expect(next).toBeDisabled();
  await previous.click();
  await expect(next).toBeEnabled();
  const last = page.locator("#projects article > a").last();

  await last.focus();
  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", { name: "프로젝트 상세" });

  await expect(detail).toContainText("프로젝트 8");
  await page.keyboard.press("Escape");
  await expect(last).toBeFocused();
  await expect(detail).not.toBeVisible();
  const savedRange = await range.textContent();

  await page.getByRole("button", { name: "전체 보기", exact: true }).click();
  await expect(range).toHaveText("전체 7개");
  await expect(next).toHaveCount(0);
  const list = page.getByRole("region", { name: "프로젝트 목록" });

  expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  const rows = await page
    .locator("#projects article")
    .evaluateAll(
      (cards) => new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
    );

  expect(rows).toBeGreaterThan(1);
  const popupPromise = page.waitForEvent("popup");

  await page.getByRole("link", { name: "외부 문서 ↗", exact: true }).click();
  const popup = await popupPromise;

  await expect(popup).toHaveURL("https://example.test/modern-project");
  await popup.close();
  await expect(detail).not.toBeVisible();
  await page.getByRole("button", { name: "가로 보기", exact: true }).click();
  await expect(range).toHaveText(savedRange || "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Modern keeps offscreen projects keyboard-accessible and updates navigation on resize and touch scrolling", async ({
  page,
}) => {
  await identity(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const draft = initialDraft();
  draft.document = structuredClone(swissSample);
  draft.document.template = "modern-flat";
  draft.document.projects = Array.from({ length: 5 }, (_, index) => ({
    ...structuredClone(swissSample.projects[0]),
    id: "keyboard-project-" + index,
    title: "ProjectWithoutWhitespace".repeat(3) + index,
  }));
  await page.route("**/api/portfolio", (route) => route.fulfill({ json: draft }));
  await page.goto("/preview");
  const range = page.getByRole("status", { name: "프로젝트 표시 범위" });
  const list = page.getByRole("region", { name: "프로젝트 목록" });
  const last = page.locator("#projects article > a").last();

  await last.focus();
  await expect(page.getByRole("button", { name: "다음 프로젝트" })).toBeDisabled();
  const before = await list.evaluate((element) => element.scrollLeft);

  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", { name: "프로젝트 상세" });

  await expect(detail).toContainText(draft.document.projects[4].title);
  await page.keyboard.press("Escape");
  await expect(last).toBeFocused();
  expect(await list.evaluate((element) => element.scrollLeft)).toBe(before);

  for (const [width, expected] of [
    [1440, "1–3 / 5"],
    [768, "1–2 / 5"],
    [320, "1 / 5"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await list.evaluate((element) => element.scrollTo({ left: 0, behavior: "instant" }));
    await expect(range).toHaveText(expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }

  // Native touch/wheel scrolling must update the same controls as the arrow buttons.
  await list.evaluate((element) =>
    element.scrollTo({ left: element.scrollWidth, behavior: "instant" }),
  );
  await expect(range).toHaveText("5 / 5");
  await expect(page.getByRole("button", { name: "다음 프로젝트" })).toBeDisabled();
  await page.getByRole("button", { name: "이전 프로젝트" }).click();
  await expect(range).toHaveText("4 / 5");
  await last.focus();
  await page.keyboard.press("Enter");
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(last).toBeFocused();
});
