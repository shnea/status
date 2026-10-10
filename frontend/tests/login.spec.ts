import { expect, test } from "@playwright/test";

test("login starts the real provider flow with PKCE and a secure session", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const authorization = await page.request.get("/oauth2/authorization/platform", {
    maxRedirects: 0,
  });

  expect(authorization.status()).toBe(302);

  const destination = new URL(authorization.headers().location);
  expect(destination.origin).toBe("https://platform.shnea.kr");
  expect(destination.searchParams.get("redirect_uri")).toBe(
    process.env.APP_PUBLIC_URL + "/callback",
  );
  expect(destination.searchParams.get("code_challenge_method")).toBe("S256");
  expect(destination.searchParams.has("state")).toBe(true);
  expect(destination.searchParams.has("nonce")).toBe(true);

  const cookieHeaders = authorization
    .headersArray()
    .flatMap((header) => (header.name.toLowerCase() === "set-cookie" ? [header.value] : []));

  expect(
    cookieHeaders.some(
      (value) =>
        value.includes("Secure") && value.includes("HttpOnly") && value.includes("SameSite=Lax"),
    ),
  ).toBe(true);

  await page.getByRole("link", { name: "플랫폼으로 로그인" }).click();
  await expect(page).toHaveURL(/^https:\/\/platform\.shnea\.kr\//);
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("anonymous dashboard and admin visits require login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  const denied = await page.request.get("/api/admin/overview");
  expect(denied.status()).toBe(401);
});

test("a callback without a matching login state fails safely", async ({ page }) => {
  await page.goto("/callback?code=invalid-test-code&state=invalid-test-state");
  await expect(page).toHaveURL(/\/login\?error=oidc$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "로그인을 완료하지 못했습니다",
  );
  const identity = await page.request.get("/api/session");
  expect((await identity.json()).member).toBeNull();
});
