"use client";

import { ShneaEditor } from "@shnea/editor/react";
import type { AttachmentAdapter, EditorDocument } from "@shnea/editor";
import styles from "./Workspace.module.css";

const appearance = {
  fontSize: 16,
  lineHeight: 1.7,
  radius: 0,
  colors: { background: "#f6f5f0", text: "#191919", border: "#aaa9a3", accent: "#b34224" },
};

export function DocumentEditor({
  value,
  documentKey,
  label,
  busy,
  change,
  onError,
  attachments,
}: {
  attachments: AttachmentAdapter;
  value: EditorDocument | null;
  documentKey: string;
  label: string;
  busy: boolean;
  change: (document: EditorDocument) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className={styles.editorHost} inert={busy}>
      <ShneaEditor
        value={value}
        documentKey={documentKey}
        label={label}
        appearance={appearance}
        attachments={attachments}
        onChange={({ document }) => change(document)}
        onError={(error) =>
          onError(error instanceof Error ? error.message : "내용을 편집하지 못했습니다.")
        }
      />
    </div>
  );
}
