import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/setup.ts",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  outputDir: "/artifacts/test-results",
  use: {
    baseURL: process.env.APP_PUBLIC_URL,
    screenshot: "only-on-failure",
    // OAuth callback codes and session tokens must not be captured in traces.
    trace: "off",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
