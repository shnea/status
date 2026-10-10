"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import type { PortfolioDocument } from "@/features/portfolio/model";
import { orderedSections } from "@/features/portfolio/model";
import type { DesignSetting } from "@/features/templates/model";
import { samplePaths } from "@/features/templates/model";
import { OrderedItems, moveItem } from "./OrderedItems";
import styles from "./Workspace.module.css";

const names = {
  about: "자기소개",
  skills: "스킬",
  projects: "프로젝트",
  history: "히스토리",
  certifications: "자격 · 인증",
};

export function SettingsEditor({
  document,
  busy,
  change,
  aiSettings,
}: {
  document: PortfolioDocument;
  aiSettings?: ReactNode;
  busy: boolean;
  change: (update: (current: PortfolioDocument) => PortfolioDocument) => void;
}) {
  const [designs, setDesigns] = useState<DesignSetting[]>([]);
  const [failure, setFailure] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<DesignSetting[]>("/portfolio/designs", { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) {
          setDesigns(items);
          setFailure("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFailure(error instanceof Error ? error.message : "디자인을 불러오지 못했습니다.");
      });

    return () => controller.abort();
  }, [refresh]);

  return (
    <section aria-label="표시 설정">
      <h2 className={styles.sectionTitle}>설정</h2>
      <h3 className={styles.fieldTitle}>섹션 순서 · 표시</h3>
      <OrderedItems
        items={orderedSections(document).map((section) => ({
          id: section.id,
          title: names[section.id],
          visible: section.visible,
        }))}
        disabled={busy}
        visibility={(id, visible) =>
          change((current) => ({
            ...current,
            sections: orderedSections(current).map((section) =>
              section.id === id ? { ...section, visible } : section,
            ),
          }))
        }
        move={(from, to) =>
          change((current) => ({
            ...current,
            sections: moveItem(orderedSections(current), from, to),
          }))
        }
      />
      <section className={styles.editorSection}>
        <h3 className={styles.fieldTitle}>공개 디자인</h3>
        {failure && (
          <p className={styles.error} role="alert">
            {failure}
          </p>
        )}
        <div className={styles.actions}>
          <label className={styles.field}>
            디자인
            <select
              className={styles.input}
              value={document.template}
              disabled={busy || !designs.length}
              onChange={(event) => {
                const template = event.target.value;
                change((current) => ({ ...current, template }));
              }}
            >
              {!designs.length && <option value={document.template}>불러오는 중…</option>}
              {designs.map((design) => (
                <option
                  key={design.id}
                  value={design.id}
                  disabled={!design.enabled || !design.implemented}
                >
                  {design.title}
                  {!design.implemented ? " · 준비 중" : !design.enabled ? " · 신규 선택 중단" : ""}
                </option>
              ))}
            </select>
          </label>
          {samplePaths.has(document.template) && (
            <a
              className={styles.button}
              href={samplePaths.get(document.template)}
              target="_blank"
              rel="noopener noreferrer"
            >
              디자인 미리보기 ↗
            </a>
          )}
          {failure && (
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => setRefresh((value) => value + 1)}
            >
              다시 불러오기
            </button>
          )}
        </div>
      </section>
      {aiSettings}
    </section>
  );
}
