import { sitemapPage, xmlResponse, xmlText } from "@/features/portfolio/sitemap";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;

  if (!/^(0|[1-9][0-9]{0,6})$/.test(page) || Number(page) > 1000000)
    return new Response(null, { status: 404 });
  const result = await sitemapPage(Number(page));

  if (Number(page) >= Math.max(1, result.pages))
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const origin = process.env.APP_PUBLIC_URL || "http://localhost:30165";

  const entries = result.entries.map(
    (entry) =>
      "<url><loc>" +
      xmlText(origin + entry.path) +
      "</loc><lastmod>" +
      xmlText(entry.updatedAt) +
      "</lastmod></url>",
  );

  if (page === "0") entries.unshift("<url><loc>" + xmlText(origin + "/") + "</loc></url>");

  return xmlResponse(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries.join("") + "</urlset>",
  );
}
