import { sitemapPage, xmlResponse, xmlText } from "@/features/portfolio/sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await sitemapPage(0);
  const origin = process.env.APP_PUBLIC_URL || "http://localhost:30165";
  const pages = Math.max(1, result.pages);

  const entries = Array.from(
    { length: pages },
    (_, page) => "<sitemap><loc>" + xmlText(origin + "/sitemaps/" + page) + "</loc></sitemap>",
  ).join("");

  return xmlResponse(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      entries +
      "</sitemapindex>",
  );
}
