"use client";

import type { AttachmentAdapter } from "@shnea/editor";

import { ImageInput } from "@/features/files/ImageInput";
import { DocumentEditor } from "./DocumentEditor";
import { ContactsEditor } from "./ContactsEditor";
import type { PortfolioDocument } from "@/features/portfolio/model";
import styles from "./Workspace.module.css";

export function ProfileEditor({
  document,
  portfolioId,
  busy,
  change,
  onError,
  attachments,
}: {
  attachments: AttachmentAdapter;
  document: PortfolioDocument;
  portfolioId: string;
  busy: boolean;
  change: (update: (current: PortfolioDocument) => PortfolioDocument) => void;
  onError: (message: string) => void;
}) {
  return (
    <section>
      <h2 className={styles.sectionTitle}>프로필</h2>
      <fieldset disabled={busy} className={styles.fieldset}>
        <label className={styles.field}>
          표시 이름
          <input
            className={styles.input}
            maxLength={100}
            value={document.profile.name}
            onChange={(event) =>
              change((current) => ({
                ...current,
                profile: { ...current.profile, name: event.target.value },
              }))
            }
          />
        </label>
        <label className={styles.field}>
          메인 타이틀
          <textarea
            className={styles.input}
            maxLength={200}
            rows={2}
            value={document.profile.title || ""}
            onChange={(event) =>
              change((current) => ({
                ...current,
                profile: { ...current.profile, title: event.target.value },
              }))
            }
          />
        </label>
        <label className={styles.field}>
          한 줄 소개
          <input
            className={styles.input}
            maxLength={300}
            value={document.profile.introduction}
            onChange={(event) =>
              change((current) => ({
                ...current,
                profile: { ...current.profile, introduction: event.target.value },
              }))
            }
          />
        </label>
      </fieldset>
      <ImageInput
        value={document.profile.imageId}
        label="프로필 이미지"
        adapter={attachments}
        disabled={busy}
        change={(imageId) =>
          change((current) => ({ ...current, profile: { ...current.profile, imageId } }))
        }
      />
      {document.template !== "swiss" && (
        <ImageInput
          value={document.profile.bannerImageId}
          label="간판 이미지"
          adapter={attachments}
          disabled={busy}
          change={(bannerImageId) =>
            change((current) => ({ ...current, profile: { ...current.profile, bannerImageId } }))
          }
        />
      )}
      <div className={styles.field}>
        <h3 className={styles.fieldTitle}>자기소개</h3>
        <DocumentEditor
          value={document.profile.about}
          documentKey={portfolioId + ":profile"}
          label="자기소개"
          busy={busy}
          change={(about) =>
            change((current) => ({
              ...current,
              profile: { ...current.profile, about },
            }))
          }
          onError={onError}
          attachments={attachments}
        />
      </div>
      <ContactsEditor
        contacts={document.profile.contacts}
        disabled={busy}
        change={(contacts) =>
          change((current) => ({ ...current, profile: { ...current.profile, contacts } }))
        }
      />
    </section>
  );
}
