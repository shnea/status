"use client";

import type { AttachmentAdapter } from "@shnea/editor";

import { useState } from "react";
import type { History, PortfolioDocument } from "@/features/portfolio/model";
import { OrderedItems, moveItem } from "./OrderedItems";
import { EditDialog } from "./EditDialog";
import { DocumentEditor } from "./DocumentEditor";
import styles from "./Workspace.module.css";

export function HistoryEditor({
  document,
  busy,
  change,
  onError,
  attachments,
  filesPending,
}: {
  attachments: AttachmentAdapter;
  filesPending: boolean;
  document: PortfolioDocument;
  busy: boolean;
  change: (update: (current: PortfolioDocument) => PortfolioDocument) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const history = document.history.find((item) => item.id === editing);

  function update(id: string, changes: Partial<History>) {
    change((current) => ({
      ...current,
      history: current.history.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
  }

  function add() {
    const id = crypto.randomUUID();
    change((current) => ({
      ...current,
      history: [
        ...current.history,
        {
          id,
          title: "",
          organization: "",
          role: "",
          summary: "",
          startMonth: "",
          endMonth: "",
          ongoing: false,
          content: null,
          visible: true,
        },
      ],
    }));
    setEditing(id);
  }

  return (
    <section aria-label="히스토리 편집">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>히스토리</h2>
        <button type="button" className={styles.button} disabled={busy} onClick={add}>
          히스토리 추가
        </button>
      </div>
      <OrderedItems
        items={document.history}
        disabled={busy}
        edit={setEditing}
        visibility={(id, visible) => update(id, { visible })}
        move={(from, to) =>
          change((current) => ({ ...current, history: moveItem(current.history, from, to) }))
        }
        remove={(id) => {
          if (window.confirm("이 히스토리를 삭제할까요?"))
            change((current) => ({
              ...current,
              history: current.history.filter((item) => item.id !== id),
            }));
        }}
      />
      <EditDialog
        open={Boolean(history)}
        title="히스토리 수정"
        busy={busy || filesPending}
        close={() => setEditing(null)}
      >
        {history && (
          <>
            <fieldset disabled={busy} className={styles.fieldset}>
              <label className={styles.field}>
                타이틀
                <input
                  className={styles.input}
                  value={history.title}
                  maxLength={200}
                  onChange={(event) => update(history.id, { title: event.target.value })}
                />
              </label>
              <div className={styles.contactFields}>
                <label className={styles.field}>
                  소속기관명
                  <input
                    className={styles.input}
                    value={history.organization}
                    maxLength={200}
                    onChange={(event) => update(history.id, { organization: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  역할
                  <input
                    className={styles.input}
                    value={history.role}
                    maxLength={200}
                    onChange={(event) => update(history.id, { role: event.target.value })}
                  />
                </label>
              </div>
              <label className={styles.field}>
                요약
                <textarea
                  className={styles.input}
                  rows={3}
                  value={history.summary}
                  maxLength={1000}
                  onChange={(event) => update(history.id, { summary: event.target.value })}
                />
              </label>
              <div className={styles.contactFields}>
                <label className={styles.field}>
                  시작 연월
                  <input
                    className={styles.input}
                    type="month"
                    value={history.startMonth}
                    max={history.endMonth || undefined}
                    onChange={(event) => update(history.id, { startMonth: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  종료 연월
                  <input
                    className={styles.input}
                    type="month"
                    value={history.endMonth}
                    min={history.startMonth || undefined}
                    disabled={history.ongoing}
                    onChange={(event) => update(history.id, { endMonth: event.target.value })}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span>
                  <input
                    type="checkbox"
                    checked={history.ongoing}
                    onChange={(event) =>
                      update(history.id, {
                        ongoing: event.target.checked,
                        endMonth: event.target.checked ? "" : history.endMonth,
                      })
                    }
                  />{" "}
                  진행 중
                </span>
              </label>
            </fieldset>
            <h3 className={styles.fieldTitle}>내용</h3>
            <DocumentEditor
              value={history.content}
              documentKey={history.id}
              label="히스토리 내용"
              busy={busy}
              change={(content) => update(history.id, { content })}
              onError={onError}
              attachments={attachments}
            />
          </>
        )}
      </EditDialog>
    </section>
  );
}
