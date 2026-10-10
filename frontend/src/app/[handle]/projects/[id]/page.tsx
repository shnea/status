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
  params: Promise<{ handle: string; id: string }>;
}): Promise<Metadata> {
  const { handle, id } = await params;
  const slug = publicSlug(handle);
  const portfolio = slug ? await publicPortfolio(slug) : null;
  const project = portfolio?.document.projects.find((item) => item.id === id);

  if (!portfolio || !project) return { robots: { index: false, follow: false } };

  return publicMetadata(portfolio, project, await siteSettings());
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}) {
  const { handle, id } = await params;

  const slug = publicSlug(handle);

  if (!slug) notFound();

  const portfolio = await publicPortfolio(slug);
  const project = portfolio?.document.projects.find((item) => item.id === id);

  if (!portfolio || !project) notFound();

  if (portfolio.slug !== slug) permanentRedirect("/@" + portfolio.slug + "/projects/" + id);

  return (
    <>
      <TrackVisit slug={portfolio.slug} />
      <PortfolioTemplate
        document={portfolio.document}
        slug={portfolio.slug}
        portfolioId={portfolio.id}
        aiEnabled={portfolio.aiEnabled}
        initialProject={project}
      />
    </>
  );
}
