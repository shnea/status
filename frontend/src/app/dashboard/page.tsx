import type { Metadata } from "next";
import { Workspace } from "@/features/workspace/Workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 포트폴리오",
  robots: { index: false, follow: false },
};

export default function Dashboard() {
  return <Workspace publicUrl={process.env.APP_PUBLIC_URL || "http://localhost:30165"} />;
}
