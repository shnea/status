import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";

test("collection editing preserves order, detail content and section privacy", async ({ page }) => {
  await identity(page);
  let stored = initialDraft();
  stored.document.skills.push({
    id: "44444444-4444-4444-8444-444444444444",
    name: "Kotlin",
    category: "언어",
    icon: { provider: "initials", key: "", hex: "", monochromeAllowed: true },
    featured: true,
  });
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "03 프로젝트", exact: true }).click();
  await page.getByRole("button", { name: "프로젝트 추가", exact: true }).click();
  const project = page.getByRole("dialog", { name: "프로젝트 수정", exact: true });
  await project.getByLabel("프로젝트명", { exact: true }).fill("첫 프로젝트");
  await project.getByLabel("역할", { exact: true }).fill("백엔드 개발");
  await project.getByLabel("요약", { exact: true }).fill("프로젝트 요약");
  await project.getByLabel("Kotlin", { exact: true }).check();
  await project
    .getByRole("textbox", { name: "프로젝트 내용", exact: true })
    .fill("프로젝트 상세 본문");
  const links = project.getByRole("region", { name: "외부 링크", exact: true });
  await links.getByRole("button", { name: "추가", exact: true }).click();
  await links.getByLabel("라벨", { exact: true }).fill("소스 코드");
  await links.getByLabel("값", { exact: true }).fill("https://github.com/example/project");
  await project.getByRole("button", { name: "닫기", exact: true }).click();

  await page.getByRole("button", { name: "프로젝트 추가", exact: true }).click();
  await project.getByLabel("프로젝트명", { exact: true }).fill("숨긴 프로젝트");
  await project
    .getByRole("textbox", { name: "프로젝트 내용", exact: true })
    .fill("비공개 세부 정보");
  await project.getByRole("button", { name: "닫기", exact: true }).click();
  const hidden = page.getByRole("listitem").filter({ hasText: "숨긴 프로젝트" });
  await hidden.getByLabel("표시", { exact: true }).uncheck();
  await hidden.getByRole("button", { name: "숨긴 프로젝트 위로" }).click();
  await expect(page.getByRole("listitem").first()).toContainText("숨긴 프로젝트");

  await page.getByRole("button", { name: "04 히스토리", exact: true }).click();
  await page.getByRole("button", { name: "히스토리 추가", exact: true }).click();
  const history = page.getByRole("dialog", { name: "히스토리 수정", exact: true });
  await history.getByLabel("타이틀", { exact: true }).fill("서비스 개발");
  await history.getByLabel("소속기관명", { exact: true }).fill("테스트 회사");
  await history.getByLabel("역할", { exact: true }).fill("개발자");
  await history.getByLabel("요약", { exact: true }).fill("히스토리 요약");
  await history.getByLabel("시작 연월", { exact: true }).fill("2024-03");
  await history.getByLabel("종료 연월", { exact: true }).fill("2025-04");
  await history.getByLabel("진행 중", { exact: true }).check();
  await expect(history.getByLabel("종료 연월", { exact: true })).toHaveValue("");
  await expect(history.getByLabel("종료 연월", { exact: true })).toBeDisabled();
  await history
    .getByRole("textbox", { name: "히스토리 내용", exact: true })
    .fill("기본 화면에는 숨겨둘 긴 히스토리");
  await history.getByRole("button", { name: "닫기", exact: true }).click();

  await page.getByRole("button", { name: "05 자격 · 인증", exact: true }).click();
  await page.getByRole("button", { name: "자격 인증 추가", exact: true }).click();
  const cert = page.getByRole("dialog", { name: "자격 인증 수정", exact: true });
  await cert.getByLabel("이름", { exact: true }).fill("개발 자격");
  await cert.getByLabel("발급기관", { exact: true }).fill("테스트 기관");
  await cert.getByLabel("발급일", { exact: true }).fill("2024-06-01");
  await cert.getByLabel("자격 ID", { exact: true }).fill("PRIVATE-CREDENTIAL");
  await cert.getByLabel("자격 URL", { exact: true }).fill("https://example.test/certificate");
  await cert.getByRole("button", { name: "닫기", exact: true }).click();

  await page.getByRole("button", { name: "06 설정", exact: true }).click();
  await page.getByRole("button", { name: "히스토리 위로" }).click();
  await page.getByRole("button", { name: "히스토리 위로" }).click();
  await page.getByRole("button", { name: "히스토리 위로" }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "스킬" })
    .getByLabel("표시", { exact: true })
    .uncheck();
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(stored.document.projects[0].title).toBe("숨긴 프로젝트");
  expect(stored.document.projects[0].visible).toBe(false);
  expect(stored.document.history[0].endMonth).toBe("");
  expect(stored.document.sections[0].id).toBe("history");
  expect(stored.document.certifications[0].credentialIdVisible).toBe(false);

  await page.getByRole("button", { name: "미리보기 ↗" }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.locator("#skills")).toHaveCount(0);
  await expect(page.getByText("숨긴 프로젝트", { exact: true })).toHaveCount(0);
  await expect(page.getByText("PRIVATE-CREDENTIAL", { exact: true })).toHaveCount(0);
  await expect(page.locator("#history")).toContainText("2024-03 — 진행 중");
  await expect(
    page.getByText("기본 화면에는 숨겨둘 긴 히스토리", { exact: true }),
  ).not.toBeVisible();
  await page.locator("#history").getByText("자세히 +", { exact: true }).click();
  await expect(page.getByText("기본 화면에는 숨겨둘 긴 히스토리", { exact: true })).toBeVisible();
  const content = page.locator("#projects");
  await expect(content.getByRole("link", { name: "소스 코드" })).toHaveAttribute(
    "href",
    "https://github.com/example/project",
  );
  await content.getByRole("link", { name: /^첫 프로젝트 ↗/ }).click();
  const detail = page.getByRole("dialog", { name: "프로젝트 상세", exact: true });
  await expect(detail).toContainText("프로젝트 상세 본문");
  await detail.getByRole("button", { name: "닫기 ×", exact: true }).press("Escape");
  await expect(detail).not.toBeVisible();
  await expect(content.getByRole("link", { name: /^첫 프로젝트 ↗/ })).toBeFocused();
  await page.screenshot({
    path: "/artifacts/preview-" + test.info().project.name + ".png",
    fullPage: true,
  });
});
