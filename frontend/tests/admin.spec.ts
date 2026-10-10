import { expect, test } from "@playwright/test";

const adminMember = {
  id: "11111111-1111-4111-8111-111111111111",
  issuer: "https://issuer.example.test",
  subject: "admin-test",
  displayName: "관리자",
  suspended: false,
  aiAllowed: false,
  joinedAt: "2026-10-01T00:00:00Z",
};

test("admin UI confirms suspension and restoration with CSRF", async ({ page }) => {
  // UI fixtures exercise the screen only; backend authorization is covered with real PostgreSQL.
  const member = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "테스트 작성자",
    slug: "test-writer",
    suspended: false,
    reason: "",
    public: true,
    joinedAt: "2026-10-02T00:00:00Z",
  };

  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: { member: adminMember, admin: true, csrfToken: "ui-test-csrf" },
    }),
  );
  await page.route("**/api/admin/overview", (route) =>
    route.fulfill({
      json: {
        users: 2,
        suspended: member.suspended ? 1 : 0,
        publicPortfolios: member.public ? 1 : 0,
      },
    }),
  );
  await page.route("**/api/admin/users?*", (route) =>
    route.fulfill({
      json: [{ ...member }, { ...member, id: adminMember.id, name: "관리자", slug: "admin" }],
    }),
  );
  await page.route("**/api/admin/users/*/suspension", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("ui-test-csrf");

    const body = route.request().postDataJSON();
    expect(body.suspended === false || body.reason.length > 0).toBe(true);
    member.suspended = body.suspended;
    member.reason = body.suspended ? body.reason : "";
    member.public = false;
    await route.fulfill({ status: 200, body: "" });
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자", exact: true })).toBeVisible();
  await expect(page.getByText("테스트 작성자", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: "/artifacts/admin-" + test.info().project.name + ".png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "이용 정지", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("정지 사유")).toBeFocused();
  await page.getByLabel("정지 사유").fill("운영 점검");
  await page.getByRole("button", { name: "정지", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("status")).toHaveText("이용을 정지했습니다.");

  await page.getByRole("button", { name: "정지 해제" }).click();
  await expect(page.getByRole("dialog")).toContainText("비공개로 유지됩니다");
  await page.getByRole("button", { name: "해제", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("포트폴리오는 비공개 상태");
  await expect(page.getByText("비공개", { exact: true })).toHaveCount(2);
});

test("regular accounts cannot see admin controls", async ({ page }) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: { member: adminMember, admin: false, csrfToken: "ui-test-csrf" },
    }),
  );
  await page.goto("/admin");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("관리자 권한이 필요합니다.");
  await expect(page.getByRole("heading", { name: "사용자 관리" })).toHaveCount(0);
});
