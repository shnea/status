"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { EditDialog } from "@/features/workspace/EditDialog";
import styles from "./AdminConsole.module.css";

export function AddCatalogIcon({ csrf, created }: { csrf: string; created: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");
  const [hex, setHex] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailure("");

    try {
      await api(
        "/admin/icons",
        { method: "POST", body: JSON.stringify({ title, key, hex }) },
        csrf,
      );
      setOpen(false);
      setTitle("");
      setKey("");
      setHex("");
      created();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "아이콘을 추가하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => {
          setFailure("");
          setOpen(true);
        }}
      >
        아이콘 추가
      </button>
      <EditDialog open={open} title="공용 아이콘 추가" busy={busy} close={() => setOpen(false)}>
        <form onSubmit={(event) => void save(event)}>
          <label className={styles.field}>
            아이콘 이름
            <input
              className={styles.input}
              required
              maxLength={100}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            Simple Icons 식별자
            <input
              className={styles.input}
              required
              pattern="[a-zA-Z0-9]{1,100}"
              maxLength={100}
              value={key}
              disabled={busy}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            원본 색상 (HEX)
            <input
              className={styles.input}
              required
              pattern="#?[a-fA-F0-9]{6}"
              maxLength={7}
              value={hex}
              disabled={busy}
              onChange={(event) => setHex(event.target.value)}
            />
          </label>
          <a href="https://simpleicons.org/" target="_blank" rel="noopener noreferrer">
            식별자·원본 색상 확인 ↗
          </a>
          {failure && (
            <p className={styles.error} role="alert">
              {failure}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button className={styles.button + " " + styles.primary} disabled={busy}>
              아이콘 저장
            </button>
          </div>
        </form>
      </EditDialog>
    </>
  );
}
