"use client";

import { useEffect, useRef, useState } from "react";
import type { AttachmentViews } from "@shnea/editor";
import { api } from "@/lib/api";
import { mountVideo } from "./video";
import styles from "./FileViewer.module.css";

interface FileViews extends AttachmentViews {
  name: string;
  mediaType: string;
}

function Video({ data }: { data: FileViews }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const player = mountVideo(host.current, data);

    return () => player.destroy();
  }, [data]);

  return <div ref={host} />;
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState("");
  const [failure, setFailure] = useState("");
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, {
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Range: "bytes=0-262143" },
        });

        if (!response.ok) throw new Error("파일 내용을 불러오지 못했습니다.");
        const reader = response.body?.getReader();

        if (!reader) throw new Error("파일 내용을 불러오지 못했습니다.");
        const chunks: Uint8Array[] = [];
        let length = 0;

        while (length <= 262144) {
          const part = await reader.read();

          if (part.done) break;
          chunks.push(part.value);
          length += part.value.length;
        }

        await reader.cancel();
        const bytes = new Uint8Array(Math.min(length, 262144));
        let offset = 0;

        for (const chunk of chunks) {
          const portion = chunk.subarray(0, bytes.length - offset);
          bytes.set(portion, offset);
          offset += portion.length;

          if (offset === bytes.length) break;
        }

        if (!controller.signal.aborted) {
          setText(new TextDecoder().decode(bytes));
          const total = Number(response.headers.get("Content-Range")?.split("/")[1]);
          setTruncated(length > bytes.length || total > bytes.length);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setFailure(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
      }
    })();

    return () => controller.abort();
  }, [url]);

  return (
    <>
      {failure && <p role="alert">{failure}</p>}
      <pre>{text}</pre>
      {truncated && <p>처음 256KiB만 표시합니다. 전체 내용은 원본을 내려받아 확인해주세요.</p>}
    </>
  );
}

export function FileViewer({ id, portfolioId }: { id: string; portfolioId?: string }) {
  const [data, setData] = useState<FileViews | null>(null);
  const [failure, setFailure] = useState("");
  const [refresh, setRefresh] = useState(0);
  const base = portfolioId ? "/public/files/" + portfolioId + "/" : "/files/";
  useEffect(() => {
    const controller = new AbortController();
    void api<FileViews>(base + id + "/views", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setFailure("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setData(null);
          setFailure(error instanceof Error ? error.message : "파일을 불러오지 못했습니다.");
        }
      });

    return () => controller.abort();
  }, [base, id, refresh]);

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <header className={styles.heading}>
        <h1>{data?.name || "파일 보기"}</h1>
        <button onClick={() => setRefresh((value) => value + 1)}>다시 조회</button>
      </header>
      {failure ? (
        <p role="alert">{failure}</p>
      ) : !data ? (
        <p role="status">불러오는 중…</p>
      ) : (
        <>
          <nav className={styles.actions} aria-label="파일 작업">
            <a href={data.downloadUrl}>다운로드</a>
            <a href={data.originalUrl} target="_blank" rel="noopener noreferrer">
              원본 보기 ↗
            </a>
          </nav>
          {["QUEUED", "PROCESSING"].includes(data.state) && (
            <p role="status">미리보기를 준비하고 있습니다. 잠시 후 다시 조회해주세요.</p>
          )}
          {["UNSUPPORTED", "FAILED"].includes(data.state) && (
            <p role="status">미리보기를 사용할 수 없습니다. 원본을 내려받아 주세요.</p>
          )}
          {data.kind === "IMAGE" && (data.previewUrl || data.thumbnailUrl) && (
            <img src={data.previewUrl || data.thumbnailUrl || ""} alt={data.name} />
          )}
          {data.kind === "VIDEO" && data.streamUrl && <Video data={data} />}
          {data.kind === "AUDIO" && data.previewUrl && (
            <audio controls preload="metadata" src={data.previewUrl} aria-label={data.name} />
          )}
          {data.kind === "PDF" && data.state === "READY" && (
            <iframe className={styles.document} src={data.originalUrl} title={data.name + " PDF"} />
          )}
          {["TEXT", "MARKDOWN"].includes(data.kind) && data.state === "READY" && (
            <TextPreview url={data.originalUrl} />
          )}
        </>
      )}
    </main>
  );
}
