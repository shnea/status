import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.APP_PUBLIC_URL || "http://localhost:30165";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/dashboard",
        "/admin",
        "/preview",
        "/design-preview",
        "/print/",
        "/file-viewer/",
        "/api/",
        "/oauth2/",
        "/callback",
        "/logout",
      ],
    },
    sitemap: origin + "/sitemap.xml",
  };
}
