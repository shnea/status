import type { Metadata } from "next";
import { siteSettings } from "@/lib/site-api";
import { publicMetadata } from "@/features/portfolio/metadata";
import { TrackVisit } from "@/features/statistics/TrackVisit";
import { notFound, permanentRedirect } from "next/navigation";
import { publicPortfolio, publicSlug } from "@/lib/public-api";
import { PortfolioTemplate } from "@/features/templates/PortfolioTemplate";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const slug = publicSlug(handle);
  const portfolio = slug ? await publicPortfolio(slug) : null;

  if (!portfolio) return { robots: { index: false, follow: false } };

  return publicMetadata(portfolio, undefined, await siteSettings());
}

export default async function PublicPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;

  const slug = publicSlug(handle);

  if (!slug) notFound();

  const portfolio = await publicPortfolio(slug);

  if (!portfolio) notFound();

  if (portfolio.slug !== slug) permanentRedirect("/@" + portfolio.slug);

  return (
    <>
      <TrackVisit slug={portfolio.slug} />
      <PortfolioTemplate
        document={portfolio.document}
        slug={portfolio.slug}
        portfolioId={portfolio.id}
        aiEnabled={portfolio.aiEnabled}
      />
    </>
  );
}
