interface SitemapEntry {
  path: string;
  updatedAt: string;
}

interface SitemapPage {
  pages: number;
  entries: SitemapEntry[];
}

export async function sitemapPage(page: number): Promise<SitemapPage> {
  const response = await fetch(
    (process.env.BACKEND_URL || "http://backend:8080") + "/api/public/sitemap?page=" + page,
    { cache: "no-store" },
  );

  if (!response.ok) throw new Error("사이트맵을 불러오지 못했습니다.");

  return response.json();
}

export function xmlResponse(body: string): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?>' + body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
