import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";
import type { Skill } from "../src/features/portfolio/model";

test("contacts preserve order, type and visibility in the saved preview", async ({ page }) => {
  await identity(page);
  let stored = initialDraft();
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });
  await page.goto("/dashboard");
  const contacts = page.getByRole("region", { name: "연락처 · 링크", exact: true });
  await contacts.getByRole("button", { name: "추가", exact: true }).click();
  let first = contacts.getByRole("group", { name: "연락처 · 링크 1", exact: true });
  await first.getByLabel("유형").selectOption("email");
  await first.getByLabel("라벨").fill("연락하기");
  await first.getByLabel("값").fill("writer@example.test");
  await contacts.getByRole("button", { name: "추가", exact: true }).click();
  const second = contacts.getByRole("group", { name: "연락처 · 링크 2", exact: true });
  await second.getByLabel("라벨").fill("비공개 링크");
  await second.getByLabel("값").fill("https://private.example.test/");
  await second.getByLabel("공개", { exact: true }).uncheck();
  await second.getByRole("button", { name: "연락처 · 링크 2 위로" }).click();
  first = contacts.getByRole("group", { name: "연락처 · 링크 1", exact: true });
  await expect(first.getByLabel("라벨")).toHaveValue("비공개 링크");
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(stored.document.profile.contacts[0].visible).toBe(false);
  expect(stored.document.profile.contacts[1].type).toBe("email");

  await page.getByRole("button", { name: "미리보기 ↗" }).click();
  await expect(page.getByRole("link", { name: "연락하기" })).toHaveAttribute(
    "href",
    "mailto:writer@example.test",
  );
  await expect(page.getByRole("link", { name: "비공개 링크" })).toHaveCount(0);
});

test("skills search, featured limit, personal registration and icons share the draft flow", async ({
  page,
}) => {
  await identity(page);
  let stored = initialDraft();
  stored.document.skills = Array.from({ length: 10 }, (_, index): Skill => ({
    id: "00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
    name: "스킬 " + (index + 1),
    category: "도구",
    icon: { provider: "initials", key: "", hex: "", monochromeAllowed: true },
    featured: true,
  }));

  const kotlin = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Kotlin",
    category: "언어",
    icon: { provider: "simple-icons", key: "kotlin", hex: "7F52FF", monochromeAllowed: false },
    personal: false,
    active: true,
  };

  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });
  await page.route("**/api/catalog/skills?*", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") || "";

    return route.fulfill({
      json: {
        items: kotlin.name.toLowerCase().includes(query.toLowerCase()) ? [kotlin] : [],
        hasMore: false,
      },
    });
  });
  await page.route("**/api/catalog/icons?*", (route) =>
    route.fulfill({
      json: {
        items: [{ ...kotlin.icon, title: "Kotlin" }],
        hasMore: false,
      },
    }),
  );
  await page.route("**/api/catalog/skills", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("ui-test-csrf");
    const body = route.request().postDataJSON();
    expect(body.name).toBe("MyTool");
    expect(body.category).toBe("설계");
    expect(body.icon.provider).toBe("lucide");
    await route.fulfill({
      json: {
        id: "55555555-5555-4555-8555-555555555555",
        ...body,
        personal: true,
        active: true,
      },
    });
  });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "02 스킬", exact: true }).click();
  await page.getByRole("searchbox", { name: "스킬 검색", exact: true }).fill("Kotlin");
  await page.getByRole("button", { name: "Kotlin 언어 +" }).click();
  await page.getByRole("button", { name: "Kotlin 대표 스킬로 이동" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "대표 스킬은 최대 10개입니다.",
  );
  await page.getByRole("button", { name: "스킬 1 일반 스킬로 이동" }).click();
  await page.getByRole("button", { name: "Kotlin 대표 스킬로 이동" }).click();
  await expect(page.getByRole("region", { name: "대표 스킬", exact: true })).toContainText(
    "Kotlin",
  );
  await page.getByRole("searchbox", { name: "스킬 검색", exact: true }).fill("MyTool");
  await expect(
    page
      .getByRole("region", { name: "스킬 검색 결과" })
      .getByText("검색 결과가 없습니다.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "개인 스킬 등록", exact: true }).click();
  const form = page.getByRole("dialog", { name: "개인 스킬 등록", exact: true });
  await expect(form.getByLabel("스킬명")).toHaveValue("MyTool");
  await form.getByLabel("카테고리").fill("설계");
  await form.getByRole("button", { name: "스킬 아이콘 선택", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "스킬 아이콘 선택", exact: true });
  await picker.getByRole("button", { name: "코드", exact: true }).click();
  await expect(form.getByRole("button", { name: "스킬 아이콘 선택", exact: true })).toBeFocused();
  await form.getByRole("button", { name: "등록", exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByRole("region", { name: "일반 스킬", exact: true })).toContainText(
    "MyTool",
  );
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(stored.document.skills.filter((skill) => skill.featured)).toHaveLength(10);
  expect(stored.document.skills.find((skill) => skill.name === "MyTool")?.icon.key).toBe("code");
  await page.screenshot({
    path: "/artifacts/skills-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "미리보기 ↗" }).click();
  const skills = page.locator("#skills");
  await expect(skills).toContainText("Kotlin");
  await expect(skills).not.toContainText("MyTool");
  await skills.getByRole("button", { name: "더보기 +" }).click();
  await expect(skills).toContainText("MyTool");
  await expect(skills.locator("svg")).toHaveCount(1);
});

test("personal skill edits preserve draft references and retry the same form after failure", async ({
  page,
}) => {
  await identity(page);
  let stored = initialDraft();

  let personal = {
    id: "55555555-5555-4555-8555-555555555555",
    name: "MyTool",
    category: "설계",
    icon: { provider: "initials", key: "", hex: "", monochromeAllowed: true },
    active: true,
  };

  stored.document.skills = [{ ...personal, featured: true }];
  stored.document.projects = [
    {
      id: "66666666-6666-4666-8666-666666666666",
      title: "프로젝트",
      role: "",
      summary: "",
      imageId: null,
      links: [],
      skillIds: [personal.id],
      content: null,
      visible: true,
    },
  ];
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      stored = { ...stored, document: body.document, revision: stored.revision + 1 };
    }

    await route.fulfill({ json: stored });
  });
  await page.route("**/api/catalog/skills?*", (route) =>
    route.fulfill({ json: { items: [], hasMore: false } }),
  );
  await page.route("**/api/catalog/personal-skills?*", (route) =>
    route.fulfill({ json: { items: [personal], hasMore: false } }),
  );
  let requests = 0;
  await page.route("**/api/catalog/skills/" + personal.id, async (route) => {
    requests += 1;
    expect(route.request().headers()["x-csrf-token"]).toBe("ui-test-csrf");
    const body = route.request().postDataJSON();
    expect(body.name).toBe("MyTool 2");
    expect(body.category).toBe("개발");
    expect(body.active).toBe(false);

    if (requests === 1) {
      await route.fulfill({ status: 503, json: { message: "잠시 후 다시 저장해주세요." } });

      return;
    }

    personal = { ...personal, ...body };
    await route.fulfill({ json: personal });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "02 스킬", exact: true }).click();
  await page.getByRole("button", { name: "개인 스킬 관리", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "개인 스킬 관리", exact: true });
  await manager.getByRole("button", { name: "MyTool 개인 스킬 편집" }).click();
  const form = page.getByRole("dialog", { name: "개인 스킬 편집", exact: true });
  await form.getByLabel("스킬명").fill("MyTool 2");
  await form.getByLabel("카테고리").fill("개발");
  await form.getByLabel("신규 선택 허용").uncheck();
  await form.getByRole("button", { name: "저장", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("잠시 후 다시 저장해주세요.");
  await expect(form.getByLabel("스킬명")).toHaveValue("MyTool 2");
  await expect(form.getByLabel("신규 선택 허용")).not.toBeChecked();
  await form.getByRole("button", { name: "저장", exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(manager.getByRole("button", { name: "MyTool 2 개인 스킬 편집" })).toContainText(
    "신규 선택 중단",
  );
  await manager.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("button", { name: "개인 스킬 관리", exact: true })).toBeFocused();
  await expect(page.getByRole("region", { name: "대표 스킬", exact: true })).toContainText(
    "MyTool 2",
  );
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
  expect(stored.document.skills[0].id).toBe(personal.id);
  expect(stored.document.skills[0].featured).toBe(true);
  expect(stored.document.projects[0].skillIds).toEqual([personal.id]);
  expect(requests).toBe(2);
});
