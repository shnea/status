import type { Metadata } from "next";
import { SwissPortfolio } from "@/features/templates/swiss/SwissPortfolio";
import { swissSample } from "@/features/templates/swiss/sample";

export const metadata: Metadata = {
  title: "Swiss 디자인 미리보기",
  robots: { index: false, follow: false },
};

export default function SwissDesignPreview() {
  return (
    <SwissPortfolio
      document={swissSample}
      slug="design-sample"
      portfolioId="00000000-0000-4000-8000-000000000000"
      preview
      sample
    />
  );
}
