import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";

test("home opens a template chooser before a sample portfolio", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "샘플 포트폴리오 보기" }).click();
  await expect(page).toHaveURL(/\/design-preview$/);
  await expect(page.getByRole("heading", { name: "템플릿 선택", exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator("iframe")).toHaveCount(5);
  await expect(
    page.frameLocator('iframe[title="Swiss Editorial Portfolio 샘플"]').locator("h1"),
  ).toContainText("김상태");

  for (const [id, title] of [
    ["hud", "Dark Futuristic HUD Portfolio"],
    ["google-flat", "Google-inspired Flat Portfolio"],
    ["modern-flat", "Modern Flat Minimal Portfolio"],
    ["premium-dark", "Premium Dark Minimal Portfolio"],
  ]) {
    await expect(page.getByRole("link", { name: title, exact: true })).toHaveAttribute(
      "href",
      "/design-preview/" + id,
    );
  }

  const sample = page.getByRole("link", { name: /Swiss Editorial Portfolio/ });
  await expect(sample).toHaveAttribute("href", "/design-preview/swiss");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "/artifacts/template-gallery-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await sample.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/design-preview\/swiss$/);
  await expect(page.getByRole("heading", { name: "김상태", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "템플릿 목록으로 ↗" }).click();
  await expect(page).toHaveURL(/\/design-preview$/);
});

test("all design selections retain section settings and link to real templates", async ({
  page,
}) => {
  await identity(page);
  let stored = initialDraft();
  stored.document.profile.name = "작성자 이름";
  stored.document.sections.reverse();
  stored.document.sections[1].visible = false;
  stored.isPublic = true;
  stored.publishedRevision = 0;
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
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "06 설정", exact: true }).click();
  const select = page.getByRole("combobox", { name: "디자인", exact: true });
  await expect(select).toHaveValue("swiss");
  const savedSections = structuredClone(stored.document.sections);
  const savedSlug = stored.slug;

  for (const id of ["hud", "google-flat", "modern-flat", "premium-dark", "swiss"]) {
    await select.selectOption(id);
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
    expect(stored.document.template).toBe(id);
    expect(stored.document.sections).toEqual(savedSections);
    expect(stored.slug).toBe(savedSlug);
    expect(stored.isPublic).toBe(true);
    expect(stored.publishedRevision).toBe(0);
    await expect(page.getByRole("link", { name: "디자인 미리보기 ↗" })).toHaveAttribute(
      "href",
      "/design-preview/" + id,
    );
  }

  expect(stored.document.profile.name).toBe("작성자 이름");
  expect(stored.document.sections[0].id).toBe("certifications");
  expect(stored.document.sections[1].visible).toBe(false);
  expect(stored.isPublic).toBe(true);
  expect(stored.publishedRevision).toBe(0);
  const previewLink = page.getByRole("link", { name: "디자인 미리보기 ↗" });
  await expect(previewLink).toHaveAttribute("href", "/design-preview/swiss");
  await page.goto("/design-preview/swiss");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByText("디자인 미리보기 · 예시 데이터", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "김상태", exact: true })).toBeVisible();
  await expect(page.locator("#skills")).not.toContainText("PostgreSQL");
  await page.getByRole("button", { name: "더보기 +" }).click();
  await expect(page.locator("#skills")).toContainText("PostgreSQL");
  await page.screenshot({
    path: "/artifacts/swiss-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /^포트폴리오 서비스 ↗/ }).click();
  const detail = page.getByRole("dialog", { name: "프로젝트 상세" });
  await expect(detail).toContainText("OIDC 로그인");
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();
  await expect(page.getByRole("link", { name: /^포트폴리오 서비스 ↗/ })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(page).toHaveURL(/\/design-preview\/swiss$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Swiss supports keyboard navigation and long content at 320px", async ({ page }) => {
  await identity(page);
  const draft = initialDraft();
  draft.document.profile.name = "긴 이름을 사용하는 포트폴리오 작성자";
  draft.document.profile.introduction = "Backend".repeat(14);
  draft.document.profile.contacts = [
    {
      id: "contact",
      type: "web",
      label: "외부링크".repeat(16),
      value: "https://example.com",
      icon: "globe",
      visible: true,
    },
  ];
  draft.document.skills = [
    {
      id: "skill",
      name: "SkillWithoutWhitespace".repeat(3),
      category: "분류".repeat(20),
      featured: true,
      icon: { provider: "initials", key: "", hex: "", monochromeAllowed: false },
    },
  ];
  draft.document.projects = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      title: "ProjectWithoutWhitespace".repeat(3),
      summary: "Summary".repeat(25),
      imageId: null,
      links: [],
      role: "",
      skillIds: [],
      content: null,
      visible: true,
    },
  ];
  await page.route("**/api/portfolio", (route) => route.fulfill({ json: draft }));
  await page.goto("/preview");
  await expect(
    page.getByRole("heading", { name: draft.document.profile.name, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "본문으로 건너뛰기", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const nav = page.getByRole("navigation", { name: "포트폴리오 섹션" });
  await expect(nav.getByRole("link", { name: "히스토리", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "프로젝트", exact: true })).toHaveAttribute(
    "href",
    "#projects",
  );
  const project = page.locator("#projects article > a").first();
  await project.focus();
  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", { name: "프로젝트 상세" });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("button", { name: "닫기 ×", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(project).toBeFocused();
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "/artifacts/swiss-long-" + test.info().project.name + ".png",
    fullPage: true,
  });
});
