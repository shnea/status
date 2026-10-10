"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import type { DraftView, PortfolioDocument } from "@/features/portfolio/model";

export function useDraft(csrfToken: string, paused = false) {
  const [record, setRecord] = useState<DraftView | null>(null);
  const [document, setDocument] = useState<PortfolioDocument | null>(null);

  const [status, setStatus] = useState<"saved" | "unsaved" | "saving" | "error" | "conflict">(
    "saved",
  );

  const [error, setError] = useState("");
  const recordRef = useRef<DraftView | null>(null);
  const inputRef = useRef<PortfolioDocument | null>(null);
  const generation = useRef(0);
  const savedGeneration = useRef(0);
  const pending = useRef<Promise<DraftView> | null>(null);
  const conflict = useRef(false);

  const load = useCallback((next: DraftView) => {
    recordRef.current = next;
    inputRef.current = next.document;
    generation.current = 0;
    savedGeneration.current = 0;
    conflict.current = false;
    setRecord(next);
    setDocument(next.document);
    setStatus("saved");
    setError("");
  }, []);

  const change = useCallback((update: (current: PortfolioDocument) => PortfolioDocument) => {
    const current = inputRef.current;

    if (!current) return;

    const next = update(current);
    inputRef.current = next;
    generation.current += 1;
    setDocument(next);

    if (!conflict.current) setStatus("unsaved");
  }, []);

  const save = useCallback((): Promise<DraftView> => {
    if (paused) return Promise.reject(new Error("파일 업로드가 끝난 뒤 저장해주세요."));

    if (pending.current) return pending.current;

    const current = recordRef.current;
    const input = inputRef.current;

    if (!current || !input) return Promise.reject(new Error("포트폴리오를 불러오는 중입니다."));

    if (conflict.current)
      return Promise.reject(new Error("다른 탭에서 저장한 버전을 확인해주세요."));

    if (generation.current === savedGeneration.current) return Promise.resolve(current);

    const version = generation.current;
    setStatus("saving");
    setError("");

    const operation = api<DraftView>(
      "/portfolio",
      {
        method: "PUT",
        body: JSON.stringify({ revision: current.revision, document: input }),
      },
      csrfToken,
    )
      .then((saved) => {
        const latest = recordRef.current;

        // A newer publication or consent response can arrive before this draft save.
        const next =
          latest && latest !== current
            ? {
                ...saved,
                isPublic: latest.isPublic,
                aiConsent: latest.aiConsent,
                publishedRevision: latest.publishedRevision,
              }
            : saved;

        recordRef.current = next;
        savedGeneration.current = version;
        setRecord(next);

        if (generation.current === version) {
          inputRef.current = next.document;
          setDocument(next.document);
          setStatus("saved");
        } else {
          setStatus("unsaved");
        }

        return next;
      })
      .catch((failure: Error) => {
        conflict.current = failure instanceof ApiFailure && failure.status === 409;
        setStatus(conflict.current ? "conflict" : "error");
        setError(failure.message);

        throw failure;
      })
      .finally(() => {
        pending.current = null;
      });

    pending.current = operation;

    return operation;
  }, [csrfToken, paused]);

  const flush = useCallback(async (): Promise<DraftView> => {
    let current = recordRef.current;

    if (!current) throw new Error("포트폴리오를 불러오는 중입니다.");

    while (pending.current || generation.current !== savedGeneration.current) {
      current = await save();
    }

    return current;
  }, [save]);

  const updateRecord = useCallback((next: DraftView) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  useEffect(() => {
    if (!document || status !== "unsaved" || paused) return;

    const timeout = window.setTimeout(() => {
      void save().catch(() => undefined);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [document, save, status, paused]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (generation.current !== savedGeneration.current || pending.current || paused) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", protect);

    return () => window.removeEventListener("beforeunload", protect);
  }, [paused]);

  return { record, document, status, error, load, change, save, flush, updateRecord };
}
