"use client";

import { useEffect, useRef, useState } from "react";
import type { AttachmentAdapter } from "@shnea/editor";
import styles from "./ImageInput.module.css";

export function ImageInput({
  value,
  label,
  adapter,
  disabled,
  change,
}: {
  value: string | null;
  label: string;
  adapter: AttachmentAdapter;
  disabled: boolean;
  change: (id: string | null) => void;
}) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<{ file: File; requestId: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function upload(next: { file: File; requestId: string }) {
    const scope = adapter.scope();

    if (!scope || disabled || working) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(next.file.type)) {
      setError("JPEG·PNG·WebP 이미지만 등록할 수 있습니다.");

      return;
    }

    setCandidate(next);
    setWorking(true);
    setError("");
    const operation = new AbortController();
    controller.current = operation;

    try {
      const file = await adapter.upload(next.file, {
        scope,
        kind: "image",
        requestId: next.requestId,
        signal: operation.signal,
        progress: (_percent, status) => setMessage(status),
      });

      operation.signal.throwIfAborted();
      change(file.fileId);
      setCandidate(null);
      setMessage("");
    } catch (failure) {
      if (!operation.signal.aborted)
        setError(failure instanceof Error ? failure.message : "이미지를 등록하지 못했습니다.");
    } finally {
      if (!operation.signal.aborted) setWorking(false);
    }
  }

  function cancel() {
    controller.current?.abort();
    setWorking(false);
    setMessage("업로드를 취소했습니다.");
    setError("");
  }

  function select(file: File) {
    void upload({ file, requestId: crypto.randomUUID() });
  }

  return (
    <section className={styles.field} aria-label={label}>
      <h3>{label}</h3>
      <div
        className={styles.dropArea}
        tabIndex={0}
        role="group"
        aria-label={label + " 드롭 · 붙여넣기"}
        aria-busy={working}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];

          if (file && !disabled && !working) select(file);
        }}
        onPaste={(event) => {
          const file = Array.from(event.clipboardData.files).find((item) =>
            item.type.startsWith("image/"),
          );

          if (file && !disabled && !working) {
            event.preventDefault();
            select(file);
          }
        }}
      >
        {value && (
          <img src={"/api/files/" + encodeURIComponent(value) + "/content/preview"} alt={label} />
        )}
        <div className={styles.actions}>
          <button
            type="button"
            disabled={disabled || working}
            onClick={() => input.current?.click()}
          >
            {value ? "이미지 교체" : "파일 선택"}
          </button>
          {value && (
            <button type="button" disabled={disabled || working} onClick={() => change(null)}>
              삭제
            </button>
          )}
        </div>
        <p className={styles.hint}>이미지 드롭 · Ctrl/Cmd+V</p>
        <input
          ref={input}
          className={styles.hidden}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={label + " 파일"}
          disabled={disabled || working}
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) select(file);
            event.target.value = "";
          }}
        />
        {message && <p role="status">{message}</p>}
        {working && (
          <button type="button" onClick={cancel}>
            업로드 취소
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        {candidate && !working && (error || message === "업로드를 취소했습니다.") && (
          <button
            type="button"
            disabled={disabled || working}
            onClick={() => void upload(candidate)}
          >
            다시 시도
          </button>
        )}
      </div>
    </section>
  );
}
