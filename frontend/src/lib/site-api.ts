import { cache } from "react";
import { defaultSiteSettings, type PublicSiteSettings } from "@/features/site/model";

// Request-scoped reuse; an unavailable backend keeps the login and error pages renderable.
export const siteSettings = cache(async (): Promise<PublicSiteSettings> => {
  try {
    const response = await fetch(
      (process.env.BACKEND_URL || "http://backend:8080") + "/api/public/site",
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );

    if (!response.ok) return defaultSiteSettings;

    return response.json();
  } catch {
    return defaultSiteSettings;
  }
});
