"use client";

import { useMemo } from "react";
import { ShneaViewer } from "@shnea/editor/react";
import type { AttachmentAdapter, AttachmentViews, EditorDocument } from "@shnea/editor";
import { mountVideo } from "./video";
import { api } from "@/lib/api";

const appearance = { contentPadding: 8, radius: 0 };

export function AttachmentContent({
  content,
  fileBase,
}: {
  content: EditorDocument;
  fileBase: string;
}) {
  const attachments = useMemo<AttachmentAdapter>(
    () => ({
      video: mountVideo,
      scope: () => undefined,
      upload: async () => {
        throw new Error("읽기 화면에서는 업로드할 수 없습니다.");
      },
      resolve(file, signal) {
        const path = fileBase + encodeURIComponent(file.fileId) + "/views";

        return api<AttachmentViews>(path.slice("/api".length), { signal });
      },
    }),
    [fileBase],
  );

  return <ShneaViewer value={content} attachments={attachments} appearance={appearance} />;
}
