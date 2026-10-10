import type { PortfolioDocument } from "@/features/portfolio/model";

export interface PrintDocument {
  document: PortfolioDocument;
  slug: string;
  publicProjectIds: string[];
  version: "draft" | "published";
  revision: number;
}
