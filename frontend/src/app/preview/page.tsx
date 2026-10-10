import type { Metadata } from "next";
import { Preview } from "@/features/workspace/Preview";

export const metadata: Metadata = { title: "미리보기", robots: { index: false, follow: false } };

export default function PreviewPage() {
  return <Preview />;
}
