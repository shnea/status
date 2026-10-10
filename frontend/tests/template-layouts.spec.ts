import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";
import { swissSample } from "../src/features/templates/swiss/sample";

for (const template of ["hud", "google-flat", "modern-flat", "premium-dark"]) {
  test(
    template + " sample shows real content, skills and keyboard-accessible project details",
    async ({ page }) => {
      await page.goto("/design-preview/" + template);
      await expect(page.locator('main[data-template="' + template + '"]')).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
      await expect(page.getByRole("heading", { name: "김상태", exact: true })).toBeVisible();
      await expect(page.locator("#skills")).not.toContainText("PostgreSQL");
      await page.getByRole("button", { name: "더보기 +" }).click();
      await expect(page.locator("#skills")).toContainText("PostgreSQL");
      await page.locator("#history summary").click();
      await expect(page.locator("#history")).toContainText("인증과 공개 데이터 조회");
      const card = page.locator("#projects article > a").first();
      await card.focus();
      await page.keyboard.press("Enter");
      const detail = page.getByRole("dialog", { name: "프로젝트 상세" });
      await expect(detail).toBeVisible();
      await expect(detail).toContainText("OIDC 로그인");
      await expect(detail.getByRole("button", { name: "닫기 ×" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(card).toBeFocused();
      await expect(detail).not.toBeVisible();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
      await expect(page).toHaveURL(new RegExp("/design-preview/" + template + "$"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: "/artifacts/" + template + "-" + test.info().project.name + ".png",
        fullPage: true,
      });
    },
  );

  test(
    template + " preserves section order, hides entries and renders protected images at 320px",
    async ({ page }) => {
      await identity(page);
      const draft = initialDraft();
      draft.document = structuredClone(swissSample);
      draft.document.template = template;
      draft.document.sections = [
        { id: "certifications", visible: true },
        { id: "history", visible: false },
        { id: "projects", visible: true },
        { id: "skills", visible: true },
      ];
      draft.document.profile.name = "긴 이름을 사용하는 포트폴리오 작성자";
      draft.document.profile.about = null;
      draft.document.profile.imageId = "portrait-file";
      draft.document.profile.introduction = "Backend".repeat(18);
      draft.document.projects[0].title = "ProjectWithoutWhitespace".repeat(4);
      draft.document.projects[0].imageId = "project-file";
      draft.document.projects[1].visible = false;
      draft.document.profile.contacts[0].visible = false;
      draft.document.certifications[0].credentialId = "HIDDEN-CREDENTIAL";
      draft.document.certifications[0].credentialIdVisible = false;
      await page.route("**/api/portfolio", (route) => route.fulfill({ json: draft }));
      await page.route("**/api/files/*/content/preview", (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#224955"/></svg>',
        }),
      );
      await page.goto("/preview");
      await expect(page.locator('main[data-template="' + template + '"]')).toBeVisible();
      await expect(page.getByRole("img", { name: draft.document.profile.name })).toHaveAttribute(
        "src",
        "/api/files/portrait-file/content/preview",
      );
      await expect(page.locator("#projects img").first()).toHaveAttribute(
        "src",
        "/api/files/project-file/content/preview",
      );
      await expect(page.locator("#history")).toHaveCount(0);
      await expect(page.locator("#projects")).not.toContainText("통합 인증 플랫폼");
      await expect(page.locator("main")).not.toContainText("HIDDEN-CREDENTIAL");
      await expect(page.locator("main")).not.toContainText("portfolio@example.com");
      expect(
        await page
          .locator("main section[id]")
          .evaluateAll((sections) => sections.map((section) => section.id)),
      ).toEqual(["certifications", "projects", "skills"]);
      await page.setViewportSize({ width: 320, height: 720 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const card = page.locator("#projects article > a").first();
      await card.click();
      const detail = page.getByRole("dialog", { name: "프로젝트 상세" });
      await expect(detail).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.getByRole("button", { name: "닫기 ×" }).click();
      await expect(card).toBeFocused();
      await page.screenshot({
        path: "/artifacts/" + template + "-long-" + test.info().project.name + ".png",
        fullPage: true,
      });
    },
  );
}
