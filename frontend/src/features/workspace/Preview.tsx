"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DraftView } from "@/features/portfolio/model";
import { PortfolioTemplate } from "@/features/templates/PortfolioTemplate";

export function Preview() {
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<DraftView>("/portfolio")
      .then(setDraft)
      .catch((failure: Error) => setError(failure.message));
  }, []);

  if (error)
    return (
      <main id="content" tabIndex={-1} style={{ padding: 40 }}>
        <p role="alert">{error}</p>
        <a href="/dashboard">작성 화면으로</a>
      </main>
    );

  if (!draft)
    return (
      <main id="content" tabIndex={-1} style={{ padding: 40 }} role="status">
        불러오는 중…
      </main>
    );

  return (
    <PortfolioTemplate document={draft.document} slug={draft.slug} portfolioId={draft.id} preview />
  );
}
