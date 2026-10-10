"use client";

import styles from "./Workspace.module.css";

export function AiSettings({
  enabled,
  disabled,
  change,
}: {
  enabled: boolean;
  disabled: boolean;
  change: (enabled: boolean) => void;
}) {
  return (
    <section className={styles.editorSection} aria-label="AI 관리">
      <h2 className={styles.sectionTitle}>AI 관리</h2>
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => change(event.target.checked)}
        />
        공개 포트폴리오에서 AI 사용
      </label>
    </section>
  );
}
