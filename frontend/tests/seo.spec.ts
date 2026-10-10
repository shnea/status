import { expect, test } from "@playwright/test";

test("robots and live sitemap expose public routes and leave private routes out", async ({
  page,
}) => {
  const robots = await page.request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const policy = await robots.text();

  for (const path of ["/login", "/dashboard", "/admin", "/preview", "/api/"])
    expect(policy).toContain("Disallow: " + path);
  expect(policy).toContain("Sitemap: " + process.env.APP_PUBLIC_URL + "/sitemap.xml");
  const index = await page.request.get("/sitemap.xml");
  expect(index.status()).toBe(200);
  expect(index.headers()["cache-control"]).toContain("no-store");
  expect(await index.text()).toContain("<sitemapindex");
  const urls = await page.request.get("/sitemaps/0");
  expect(urls.status()).toBe(200);
  expect(await urls.text()).toContain("<loc>" + process.env.APP_PUBLIC_URL + "/</loc>");
  expect(await urls.text()).not.toMatch(/<loc>[^<]*\/(dashboard|admin|preview|login)<\/loc>/);
  expect((await page.request.get("/sitemaps/invalid")).status()).toBe(404);
});
