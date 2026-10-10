import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PortfolioPrint } from "@/features/pdf/PortfolioPrint";
import type { PrintDocument } from "@/features/pdf/model";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "PDF 출력", robots: { index: false, follow: false } };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const authorization = (await headers()).get("authorization");

  if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) notFound();

  const response = await fetch(
    (process.env.BACKEND_URL || "http://backend:8080") + "/api/pdf/render/" + id,
    { cache: "no-store", headers: { authorization } },
  );

  if (response.status === 404) notFound();

  if (!response.ok) throw new Error("출력 자료를 불러오지 못했습니다.");
  const document: PrintDocument = await response.json();

  return (
    <PortfolioPrint
      view={document}
      jobId={id}
      publicUrl={process.env.APP_PUBLIC_URL || "http://localhost:30165"}
    />
  );
}
