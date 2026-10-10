"use client";

import type { AttachmentAdapter } from "@shnea/editor";
import type { SiteConfiguration } from "@/features/site/model";
import { ImageInput } from "@/features/files/ImageInput";
import styles from "./AdminConsole.module.css";

export function SiteSettingsFields({
  value,
  change,
  attachments,
  busy,
}: {
  value: SiteConfiguration;
  change: (value: SiteConfiguration) => void;
  attachments: AttachmentAdapter;
  busy: boolean;
}) {
  return (
    <section>
      <h3>서비스 표시</h3>
      <label className={styles.field}>
        서비스 이름
        <input
          className={styles.input}
          required
          maxLength={30}
          value={value.serviceName}
          disabled={busy}
          onChange={(event) => change({ ...value, serviceName: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        공지
        <textarea
          className={styles.input}
          rows={3}
          maxLength={500}
          value={value.announcement}
          disabled={busy}
          onChange={(event) => change({ ...value, announcement: event.target.value })}
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={value.announcementEnabled}
          disabled={busy}
          onChange={(event) => change({ ...value, announcementEnabled: event.target.checked })}
        />
        공지 표시
      </label>
      <ImageInput
        label="기본 공유 이미지"
        value={value.shareImageId}
        adapter={attachments}
        disabled={busy}
        change={(shareImageId) => change({ ...value, shareImageId })}
      />
      <h3>파일별 한도</h3>
      <div className={styles.formGrid}>
        {[
          { key: "imageMaxMiB", title: "이미지 / MiB" },
          { key: "attachmentMaxMiB", title: "기타 첨부 / MiB" },
        ].map(({ key, title }) => (
          <label className={styles.field} key={key}>
            {title}
            <input
              className={styles.input}
              required
              type="number"
              min={1}
              max={10}
              step={1}
              value={key === "imageMaxMiB" ? value.imageMaxMiB : value.attachmentMaxMiB}
              disabled={busy}
              onChange={(event) => change({ ...value, [key]: event.target.valueAsNumber || 0 })}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
