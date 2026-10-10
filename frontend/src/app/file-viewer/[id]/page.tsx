import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileViewer } from "@/features/files/FileViewer";

export const metadata: Metadata = { title: "파일 보기", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function FilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ portfolioId?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  if (Array.isArray(query.portfolioId)) notFound();
  const portfolioId = query.portfolioId;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  if (!uuid.test(id) || (portfolioId !== undefined && !uuid.test(portfolioId))) notFound();

  return <FileViewer id={id} portfolioId={portfolioId} />;
}
