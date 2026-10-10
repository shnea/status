import { expect, test } from "@playwright/test";

test("admin catalog edits survive failures and design, AI and limits use protected mutations", async ({
  page,
}) => {
  // These routes verify author UI; authorization and persistence use separate PostgreSQL integration tests.
  const member = {
    id: "11111111-1111-4111-8111-111111111111",
    displayName: "관리자",
    suspended: false,
    aiAllowed: false,
  };

  const user = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "작성자",
    slug: "writer",
    suspended: false,
    public: true,
    aiAllowed: false,
    joinedAt: "2026-10-10T00:00:00Z",
    views: 7,
    visitors: 2,
  };

  const items: {
    id: string;
    name: string;
    category: string;
    icon: { provider: string; key: string; hex: string; monochromeAllowed: boolean };
    aliases: string[];
    active: boolean;
  }[] = [];

  let failed = false;
  let iconFailed = false;
  const addedIcons: { title: string; key: string; hex: string }[] = [];

  let settings = {
    aiLimits: { sessionDaily: 10, portfolioDaily: 100, globalDaily: 1000, sessionMinute: 3 },
    site: {
      serviceName: "상태창",
      announcement: "",
      announcementEnabled: false,
      shareImageId: null,
      imageMaxMiB: 10,
      attachmentMaxMiB: 10,
    },
  };

  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { member, admin: true, csrfToken: "admin-test-csrf" } }),
  );
  await page.route("**/api/admin/overview", (route) =>
    route.fulfill({ json: { users: 2, suspended: 0, publicPortfolios: 1, views: 7, visitors: 2 } }),
  );
  await page.route("**/api/admin/users?*", (route) => route.fulfill({ json: [user] }));
  await page.route("**/api/admin/users/*/ai", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("admin-test-csrf");
    user.aiAllowed = route.request().postDataJSON().enabled;
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/admin/skills?*", (route) =>
    route.fulfill({ json: { items, hasMore: false } }),
  );
  await page.route("**/api/admin/skills", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("admin-test-csrf");
    items.push({
      ...route.request().postDataJSON(),
      id: "33333333-3333-4333-8333-333333333333",
      active: true,
    });
    await route.fulfill({ json: items[0] });
  });
  await page.route("**/api/admin/skills/*", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("admin-test-csrf");

    if (!failed) {
      failed = true;
      await route.fulfill({ status: 409, json: { message: "이미 사용 중인 이름입니다." } });

      return;
    }

    items[0] = { ...items[0], ...route.request().postDataJSON() };
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/catalog/icons?*", (route) =>
    route.fulfill({ json: { items: [], hasMore: false } }),
  );
  await page.route("**/api/admin/icons", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("admin-test-csrf");

    if (!iconFailed) {
      iconFailed = true;
      await route.fulfill({
        status: 503,
        json: { message: "아이콘 제공 여부를 확인하지 못했습니다." },
      });

      return;
    }

    addedIcons.push(route.request().postDataJSON());
    await route.fulfill({
      json: { ...addedIcons[0], provider: "simple-icons", monochromeAllowed: false },
    });
  });
  await page.route("**/api/admin/designs", (route) =>
    route.fulfill({
      json: [
        {
          id: "swiss",
          title: "Swiss Editorial Portfolio",
          enabled: true,
          implemented: true,
          isDefault: true,
        },
        {
          id: "future",
          title: "준비 중인 템플릿",
          enabled: false,
          implemented: false,
          isDefault: false,
        },
      ],
    }),
  );
  let settingsFailed = false;
  await page.route("**/api/admin/settings", async (route) => {
    if (route.request().method() === "PUT") {
      expect(route.request().headers()["x-csrf-token"]).toBe("admin-test-csrf");

      if (!settingsFailed) {
        settingsFailed = true;
        await route.fulfill({ status: 503, json: { message: "설정을 저장하지 못했습니다." } });

        return;
      }

      settings = route.request().postDataJSON();
    }

    await route.fulfill({ json: settings });
  });
  await page.route("**/api/admin/ai/usage", (route) =>
    route.fulfill({
      json: { total: 0, completed: 0, failed: 0, today: 0, averageLatencyMs: null },
    }),
  );
  await page.route("**/api/admin/files/review?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            ownerId: user.id,
            ownerName: user.name,
            name: "unused.png",
            size: 1024,
            uploadedAt: "2026-10-10T00:00:00Z",
            unreferencedSince: "2026-10-10T00:00:00Z",
            deleteAfter: "2026-10-17T00:00:00Z",
            deleting: false,
            retryPending: true,
          },
        ],
        inspected: 4,
        hasMore: false,
      },
    }),
  );
  await page.route("**/api/admin/audit", (route) =>
    route.fulfill({
      json: [
        {
          action: "skill-update",
          targetId: null,
          targetName: "검수 스킬",
          detail: "33333333-3333-4333-8333-333333333333",
          at: "2026-10-10T00:00:00Z",
        },
      ],
    }),
  );

  await page.route("**/api/admin/statistics?*", (route) => {
    const requested = new URL(route.request().url());

    return route.fulfill({
      json: {
        days: Number(requested.searchParams.get("days")),
        memberId: requested.searchParams.get("memberId"),
        daily: [{ date: "2026-10-10", views: 7, sessions: 2, registrations: 1, publications: 1 }],
      },
    });
  });

  const aiState = {
    enabled: true,
    summary: { failed: 1 },
    batches: [],
    jobs: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        portfolioId: "44444444-4444-4444-8444-444444444444",
        memberId: user.id,
        slug: user.slug,
        revision: 2,
        status: "failed",
        batch: 0,
        totalDocuments: 1,
        cleanupState: null,
        errorCode: "INDEX_FAILED",
        createdAt: "2026-10-10T00:00:00Z",
      },
    ],
  };

  const reindexes: { memberId: string | null }[] = [];
  await page.route("**/api/admin/ai", (route) => route.fulfill({ json: aiState }));
  await page.route("**/api/admin/ai/enabled", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("admin-test-csrf");
    aiState.enabled = route.request().postDataJSON().enabled;
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/admin/ai/reindex", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("admin-test-csrf");
    reindexes.push(route.request().postDataJSON());
    await route.fulfill({ json: { queued: 1 } });
  });
  await page.goto("/admin");
  await page.getByLabel("작성자 AI 사용 허용", { exact: true }).check();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("AI 사용을 허용했습니다.");
  await expect(page.getByLabel("작성자 AI 사용 허용", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "작성자 AI 관리", exact: true }).click();
  await expect(page.getByText(user.name, { exact: true })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(user.id);
  await page.getByRole("button", { name: "재시도", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("1개 재색인을 접수했습니다.");
  expect(reindexes[0]).toEqual({ memberId: user.id });
  await page.getByLabel("전체 AI 사용", { exact: true }).uncheck();
  await expect(page.getByLabel("전체 AI 사용", { exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "재색인", exact: true })).toBeDisabled();
  await page.getByLabel("전체 AI 사용", { exact: true }).check();
  await page.getByRole("button", { name: "전체 대상 선택", exact: true }).click();
  await page.getByRole("button", { name: "재색인", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "1개 포트폴리오의 재색인을 접수했습니다.",
  );
  expect(reindexes[1]).toEqual({ memberId: null });
  await page.getByRole("button", { name: "스킬 사전", exact: true }).click();
  await page.getByRole("button", { name: "아이콘 추가", exact: true }).click();
  const iconForm = page.getByRole("dialog", { name: "공용 아이콘 추가", exact: true });
  await iconForm.getByLabel("아이콘 이름", { exact: true }).fill("예시 로고");
  await iconForm.getByLabel("Simple Icons 식별자", { exact: true }).fill("example");
  await iconForm.getByLabel("원본 색상 (HEX)", { exact: true }).fill("#123456");
  await iconForm.getByRole("button", { name: "아이콘 저장", exact: true }).click();
  await expect(iconForm.getByRole("alert")).toHaveText("아이콘 제공 여부를 확인하지 못했습니다.");
  await expect(iconForm.getByLabel("Simple Icons 식별자", { exact: true })).toHaveValue("example");
  await iconForm.getByRole("button", { name: "아이콘 저장", exact: true }).click();
  await expect(iconForm).not.toBeVisible();
  expect(addedIcons[0]).toEqual({ title: "예시 로고", key: "example", hex: "#123456" });
  await expect(page.getByRole("button", { name: "아이콘 추가", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "공용 스킬 추가", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "공용 스킬 추가", exact: true });
  await dialog.getByLabel("스킬명", { exact: true }).fill("팀 문서화");
  await dialog.getByLabel("카테고리", { exact: true }).fill("업무");
  await dialog.getByLabel("검색 별칭 (한 줄에 하나)", { exact: true }).fill("문서\n문서\n정리");
  await dialog.getByRole("button", { name: "스킬 아이콘 선택", exact: true }).click();
  const icons = page.getByRole("dialog", { name: "스킬 아이콘 선택", exact: true });
  await icons.getByRole("button", { name: "협업", exact: true }).click();
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(items[0].aliases).toEqual(["문서", "정리"]);
  expect(items[0].icon.key).toBe("users");
  await page.getByRole("button", { name: "팀 문서화 편집", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "공용 스킬 편집", exact: true });
  await dialog.getByLabel("스킬명", { exact: true }).fill("기술 문서화");
  await dialog.getByLabel("신규 선택 허용", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("이미 사용 중인 이름입니다.");
  await expect(dialog.getByLabel("스킬명", { exact: true })).toHaveValue("기술 문서화");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("업무 · 신규 선택 중단", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "디자인 관리", exact: true }).click();
  await expect(page.getByLabel("준비 중인 템플릿 사용 허용", { exact: true })).toBeDisabled();
  await expect(
    page.getByLabel("Swiss Editorial Portfolio 사용 허용", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "시스템 설정", exact: true }).click();
  await page.getByLabel("서비스 이름", { exact: true }).fill("상태창 테스트");
  await page.getByLabel("공지", { exact: true }).fill("점검 안내");
  await page.getByLabel("공지 표시", { exact: true }).check();
  await page.getByLabel("기타 첨부 / MiB", { exact: true }).fill("2");
  await page.getByLabel("포트폴리오 / 일", { exact: true }).fill("120");
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("설정을 저장하지 못했습니다.");
  await expect(page.getByLabel("서비스 이름", { exact: true })).toHaveValue("상태창 테스트");
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "시스템 설정을 저장했습니다.",
  );
  await expect(page.getByRole("row", { name: /unused.png/ })).toContainText(user.name);
  await expect(page.getByRole("row", { name: /unused.png/ })).toContainText("삭제 재시도 대기");
  await expect(page.getByRole("main")).not.toContainText(user.id);
  await expect(page.getByRole("main")).not.toContainText("33333333-3333-4333-8333-333333333333");
  await expect(page.getByRole("row", { name: /검수 스킬/ })).toBeVisible();
  await expect(
    page.getByText("어디에도 참조되지 않은 상태가 7일간 유지된 파일만 자동 삭제합니다.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(settings.aiLimits.portfolioDaily).toBe(120);
  expect(settings.site).toMatchObject({
    serviceName: "상태창 테스트",
    announcement: "점검 안내",
    announcementEnabled: true,
    attachmentMaxMiB: 2,
  });
  await expect(page.getByText("공용 스킬 수정", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "사용자 관리", exact: true }).click();
  await page.getByRole("button", { name: "작성자 통계", exact: true }).click();
  await expect(page.getByRole("heading", { name: "작성자 통계", exact: true })).toBeVisible();
  await page.getByLabel("통계 기간", { exact: true }).selectOption("7");
  await expect(page.getByRole("row", { name: "2026-10-10 7 2 1 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "전체 통계 보기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "전체 통계", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
