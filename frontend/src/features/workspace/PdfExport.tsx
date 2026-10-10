"use client";

import { useState } from "react";
import { apiBlob } from "@/lib/api";
import type { DraftView } from "@/features/portfolio/model";
import { EditDialog } from "./EditDialog";
import styles from "./Workspace.module.css";

export function PdfExport({
  record,
  csrf,
  disabled,
  prepare,
  working,
}: {
  record: DraftView;
  csrf: string;
  disabled: boolean;
  prepare: () => Promise<DraftView>;
  working: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("draft");
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  async function download() {
    setBusy(true);
    working(true);
    setFailure("");

    try {
      const saved = await prepare();
      const revision = version === "draft" ? saved.revision : saved.publishedRevision;

      if (revision === null) throw new Error("아직 공개한 버전이 없습니다.");

      const pdf = await apiBlob(
        "/portfolio/pdf",
        {
          method: "POST",
          body: JSON.stringify({
            version,
            revision,
            includeProjectDetails: details,
          }),
        },
        csrf,
      );

      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = saved.slug + ".pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setOpen(false);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "PDF를 생성하지 못했습니다.");
    } finally {
      setBusy(false);
      working(false);
    }
  }

  return (
    <>
      <button
        className={styles.button}
        disabled={disabled}
        onClick={() => {
          setFailure("");
          setOpen(true);
        }}
      >
        PDF 내보내기
      </button>
      <EditDialog open={open} title="PDF 내보내기" busy={busy} close={() => setOpen(false)}>
        <label className={styles.field}>
          출력 버전
          <select
            className={styles.input}
            disabled={busy}
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          >
            <option value="draft">저장된 초안</option>
            <option value="published" disabled={record.publishedRevision === null}>
              최근 공개본
            </option>
          </select>
        </label>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={details}
            disabled={busy}
            onChange={(event) => setDetails(event.target.checked)}
          />
          프로젝트 상세 내용 포함
        </label>
        {failure && (
          <p className={styles.error} role="alert">
            {failure}
          </p>
        )}
        {busy && <p role="status">PDF 생성 중…</p>}
        <div className={styles.dialogActions}>
          <button
            className={styles.button + " " + styles.primary}
            disabled={busy}
            onClick={() => void download()}
          >
            PDF 다운로드
          </button>
        </div>
      </EditDialog>
    </>
  );
}
