import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortfolioTemplate } from "@/features/templates/PortfolioTemplate";
import { samplePaths, templateTitles } from "@/features/templates/model";
import { swissSample } from "@/features/templates/swiss/sample";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ template: string }>;
}): Promise<Metadata> {
  const { template } = await params;

  return {
    title: (templateTitles.get(template) || "디자인") + " 미리보기",
    robots: { index: false, follow: false },
  };
}

export default async function TemplateSample({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;

  if (!samplePaths.has(template)) notFound();

  return (
    <PortfolioTemplate
      document={{ ...swissSample, template }}
      slug="design-sample"
      portfolioId="00000000-0000-4000-8000-000000000000"
      preview
      sample
    />
  );
}
