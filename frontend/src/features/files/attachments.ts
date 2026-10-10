import type { AttachmentAdapter, AttachmentRef, AttachmentViews } from "@shnea/editor";
import { mountVideo } from "./video";
import { api } from "@/lib/api";

async function waitForImage(fileId: string, signal: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    signal.throwIfAborted();

    const views = await api<AttachmentViews>("/files/" + encodeURIComponent(fileId) + "/views", {
      signal,
    });

    if (views.state === "READY" && views.kind === "IMAGE" && views.previewUrl) return;

    if (views.state === "FAILED" || views.state === "UNSUPPORTED")
      throw new Error("이미지를 처리하지 못했습니다. 파일 형식을 확인한 뒤 다시 시도해주세요.");

    await new Promise<void>((resolve, reject) => {
      const aborted = () => {
        window.clearTimeout(timer);
        reject(new DOMException("Upload cancelled", "AbortError"));
      };

      const timer = window.setTimeout(() => {
        signal.removeEventListener("abort", aborted);
        resolve();
      }, 1000);

      signal.addEventListener("abort", aborted, { once: true });
    });
  }

  throw new Error("이미지 처리가 지연되고 있습니다. 같은 파일로 다시 시도해주세요.");
}

export function createAttachmentAdapter(
  ownerId: string,
  csrfToken: string,
  activity: (active: boolean) => void,
): AttachmentAdapter {
  return {
    video: mountVideo,
    scope: () => ownerId || undefined,
    async upload(file, context) {
      if (!ownerId || context.scope !== ownerId) throw new Error("로그인을 확인해주세요.");

      if (file.size === 0 || file.size > 10 * 1024 * 1024)
        throw new Error("파일은 10MiB 이하로 등록해주세요.");

      const body = new FormData();
      body.set("file", file);
      body.set("requestId", context.requestId);
      body.set("kind", context.kind);
      activity(true);
      context.progress(0, "업로드 중");

      try {
        const result = await api<AttachmentRef>(
          "/files",
          {
            method: "POST",
            body,
            signal: context.signal,
          },
          csrfToken,
        );

        if (context.kind === "image") {
          context.progress(0, "이미지 처리 중");
          await waitForImage(result.fileId, context.signal);
        }

        context.progress(100, "완료");

        return result;
      } finally {
        activity(false);
      }
    },
    resolve(file, signal) {
      return api<AttachmentViews>("/files/" + encodeURIComponent(file.fileId) + "/views", {
        signal,
      });
    },
  };
}
