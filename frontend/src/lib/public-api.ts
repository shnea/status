import type { PublicPortfolio } from "@/features/portfolio/model";

export async function publicPortfolio(slug: string): Promise<PublicPortfolio | null> {
  const response = await fetch(
    (process.env.BACKEND_URL || "http://backend:8080") +
      "/api/public/portfolios/" +
      encodeURIComponent(slug),
    { cache: "no-store" },
  );

  if (response.status === 404) return null;

  if (!response.ok) throw new Error("포트폴리오를 불러오지 못했습니다.");

  return response.json();
}

export function publicSlug(handle: string): string | null {
  let decoded: string;

  try {
    decoded = decodeURIComponent(handle);
  } catch {
    return null;
  }

  return /^@[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(decoded) ? decoded.slice(1) : null;
}
