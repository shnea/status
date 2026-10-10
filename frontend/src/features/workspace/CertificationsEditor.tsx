"use client";

import { useState } from "react";
import type { Certification, PortfolioDocument } from "@/features/portfolio/model";
import { OrderedItems, moveItem } from "./OrderedItems";
import { EditDialog } from "./EditDialog";
import styles from "./Workspace.module.css";

export function CertificationsEditor({
  document,
  busy,
  change,
}: {
  document: PortfolioDocument;
  busy: boolean;
  change: (update: (current: PortfolioDocument) => PortfolioDocument) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const certification = document.certifications.find((item) => item.id === editing);

  function update(id: string, changes: Partial<Certification>) {
    change((current) => ({
      ...current,
      certifications: current.certifications.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    }));
  }

  function add() {
    const id = crypto.randomUUID();
    change((current) => ({
      ...current,
      certifications: [
        ...current.certifications,
        {
          id,
          name: "",
          issuer: "",
          issuedOn: "",
          expiresOn: "",
          credentialId: "",
          credentialIdVisible: false,
          url: "",
          visible: true,
        },
      ],
    }));
    setEditing(id);
  }

  return (
    <section aria-label="자격 인증 편집">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>자격 · 인증</h2>
        <button type="button" className={styles.button} disabled={busy} onClick={add}>
          자격 인증 추가
        </button>
      </div>
      <OrderedItems
        items={document.certifications.map((item) => ({
          id: item.id,
          title: item.name,
          summary: item.issuer,
          visible: item.visible,
        }))}
        disabled={busy}
        edit={setEditing}
        visibility={(id, visible) => update(id, { visible })}
        move={(from, to) =>
          change((current) => ({
            ...current,
            certifications: moveItem(current.certifications, from, to),
          }))
        }
        remove={(id) => {
          if (window.confirm("이 자격 인증을 삭제할까요?"))
            change((current) => ({
              ...current,
              certifications: current.certifications.filter((item) => item.id !== id),
            }));
        }}
      />
      <EditDialog
        open={Boolean(certification)}
        title="자격 인증 수정"
        busy={busy}
        close={() => setEditing(null)}
      >
        {certification && (
          <fieldset disabled={busy} className={styles.fieldset}>
            <label className={styles.field}>
              이름
              <input
                className={styles.input}
                value={certification.name}
                maxLength={200}
                onChange={(event) => update(certification.id, { name: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              발급기관
              <input
                className={styles.input}
                value={certification.issuer}
                maxLength={200}
                onChange={(event) => update(certification.id, { issuer: event.target.value })}
              />
            </label>
            <div className={styles.contactFields}>
              <label className={styles.field}>
                발급일
                <input
                  className={styles.input}
                  type="date"
                  value={certification.issuedOn}
                  max={certification.expiresOn || undefined}
                  onChange={(event) => update(certification.id, { issuedOn: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                만료일
                <input
                  className={styles.input}
                  type="date"
                  value={certification.expiresOn}
                  min={certification.issuedOn || undefined}
                  onChange={(event) => update(certification.id, { expiresOn: event.target.value })}
                />
              </label>
            </div>
            <label className={styles.field}>
              자격 ID
              <input
                className={styles.input}
                value={certification.credentialId}
                maxLength={200}
                onChange={(event) => update(certification.id, { credentialId: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>
                <input
                  type="checkbox"
                  checked={certification.credentialIdVisible}
                  onChange={(event) =>
                    update(certification.id, { credentialIdVisible: event.target.checked })
                  }
                />
                자격 ID 공개
              </span>
            </label>
            <label className={styles.field}>
              자격 URL
              <input
                className={styles.input}
                type="url"
                value={certification.url}
                maxLength={2000}
                placeholder="https://"
                onChange={(event) => update(certification.id, { url: event.target.value })}
              />
            </label>
          </fieldset>
        )}
      </EditDialog>
    </section>
  );
}
