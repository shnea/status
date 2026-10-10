"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Workspace.module.css";

export function EditDialog({
  open,
  title,
  busy,
  close,
  children,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      previousFocus.current?.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.editDialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();

        if (!busy) close();
      }}
    >
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <button type="button" className={styles.textButton} disabled={busy} onClick={close}>
          닫기 ×
        </button>
      </header>
      {children}
      <footer className={styles.dialogActions}>
        <button type="button" className={styles.button} disabled={busy} onClick={close}>
          닫기
        </button>
      </footer>
    </dialog>
  );
}
