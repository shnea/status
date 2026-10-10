import type { FullConfig } from "@playwright/test";

export default async function setup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;

  if (!baseURL) throw new Error("APP_PUBLIC_URL is required.");
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const responses = await Promise.all(
        ["/login", "/actuator/health"].map((path) =>
          fetch(new URL(path, baseURL), { signal: AbortSignal.timeout(3000), cache: "no-store" }),
        ),
      );

      if (responses.every((response) => response.ok)) return;
    } catch {
      // Service restarts can briefly refuse connections; no UI test begins during that window.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("The frontend and API did not become ready within 60 seconds.");
}
