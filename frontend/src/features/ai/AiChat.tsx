"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Send, Square, X } from "lucide-react";
import { api, ApiFailure, session } from "@/lib/api";
import styles from "./AiChat.module.css";
import { conversationKey, readConversation, saveConversation } from "./conversation";
import type { Message, Source } from "./conversation";
import { AnswerContent } from "./AnswerContent";

interface Reply {
  requestId: string;
  status: "pending" | "completed" | "cancelling" | "cancelled";
  answer: string | null;
  sources: Source[];
}

interface Operation {
  id: string;
  controller: AbortController;
  phase: "preparing" | "submitting" | "polling";
}

export function AiChat({
  slug,
  portfolioId,
  theme = "swiss",
}: {
  slug: string;
  portfolioId: string;
  theme?: string;
}) {
  const [ready, setReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failure, setFailure] = useState("");
  const active = useRef<Operation | null>(null);
  const pendingId = useRef<string | null>(null);
  const cancelled = useRef(new Set<string>());
  const csrf = useRef("");
  const storageKey = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const path = "/public/portfolios/" + encodeURIComponent(slug) + "/ai";

  useEffect(() => {
    const controller = new AbortController();
    storageKey.current = null;
    csrf.current = "";
    cancelled.current.clear();
    setReady(false);
    setMessages([]);
    setQuestion("");
    setOpened(false);
    waiting(null);
    setBusy(false);
    setCancelling(false);
    setBlocked(false);
    setFailure("");

    void session(controller.signal)
      .then(async (identity) => {
        const key = await conversationKey(portfolioId, identity.csrfToken);

        if (controller.signal.aborted) return;
        csrf.current = identity.csrfToken;
        storageKey.current = key;
        const previous = readConversation(key);

        if (previous) {
          setMessages(previous.messages);
          setQuestion(previous.question);
          setOpened(previous.opened);
          waiting(previous.pending);
          cancelled.current = new Set(previous.cancelled);
          setCancelling(!!previous.pending && cancelled.current.has(previous.pending));
        }

        setReady(true);

        if (previous?.pending) void check();
      })
      .catch(() => {
        if (!controller.signal.aborted) setReady(true);
      });

    return () => {
      controller.abort();
      active.current?.controller.abort();
    };
  }, [portfolioId]);

  useEffect(() => {
    if (!ready || !storageKey.current) return;
    saveConversation(storageKey.current, {
      version: 1,
      opened,
      question,
      messages,
      pending,
      cancelled: Array.from(cancelled.current),
    });
  }, [ready, opened, question, messages, pending, cancelling]);

  useEffect(() => {
    if (!opened || !dialog.current) return;
    const panel = dialog.current;
    const mobile = window.matchMedia("(max-width: 640px)");
    let overflow: string | null = null;
    let backgroundFocus: HTMLElement | null = null;

    const present = () => {
      const focused = document.activeElement;

      if (
        mobile.matches &&
        panel.open &&
        focused instanceof HTMLElement &&
        !panel.contains(focused)
      )
        backgroundFocus = focused;

      panel.close();

      if (overflow !== null) {
        document.body.style.overflow = overflow;
        overflow = null;
      }

      panel.setAttribute("aria-modal", String(mobile.matches));

      if (mobile.matches) {
        overflow = document.body.style.overflow;
        panel.showModal();
        document.body.style.overflow = "hidden";
      } else {
        panel.show();
        backgroundFocus?.focus({ preventScroll: true });
        backgroundFocus = null;
      }
    };

    present();
    mobile.addEventListener("change", present);

    return () => {
      mobile.removeEventListener("change", present);
      panel.close();

      if (overflow !== null) document.body.style.overflow = overflow;
      launcher.current?.focus();
    };
  }, [opened]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "instant" });
  }, [messages, pending, opened]);

  function followSource() {
    setOpened(false);

    if (storageKey.current)
      saveConversation(storageKey.current, {
        version: 1,
        opened: false,
        question,
        messages,
        pending: pendingId.current,
        cancelled: Array.from(cancelled.current),
      });
  }

  function waiting(id: string | null) {
    pendingId.current = id;
    setPending(id);
  }

  function finishCancellation(id: string) {
    if (pendingId.current !== id) return;
    setMessages((current) => [
      ...current,
      {
        id: id + "-cancelled",
        role: "assistant",
        content: "답변 대기를 취소했습니다.",
        cancelled: true,
      },
    ]);
    waiting(null);
    setCancelling(false);
    setBusy(false);
    setFailure("");
  }

  async function collect(operation: Operation, first?: Reply) {
    let result = first;
    const deadline = Date.now() + 120000;

    while (Date.now() < deadline && pendingId.current === operation.id) {
      if (operation.controller.signal.aborted) return;

      if (!result)
        result = await api<Reply>(path + "/" + operation.id, {
          signal: operation.controller.signal,
        });

      if (pendingId.current !== operation.id || operation.controller.signal.aborted) return;

      if (
        result.status === "cancelled" ||
        (result.status === "completed" && cancelled.current.has(operation.id))
      ) {
        finishCancellation(operation.id);

        return;
      }

      if (result.status === "completed") {
        setMessages((current) => [
          ...current,
          {
            id: operation.id + "-reply",
            role: "assistant",
            content: result?.answer || "공개된 자료에서 확인할 수 없습니다.",
            sources: result?.sources,
          },
        ]);
        waiting(null);

        return;
      }

      if (result.status === "cancelling") setCancelling(true);
      await new Promise<void>((resolve) => {
        const finish = () => {
          window.clearTimeout(timer);
          operation.controller.signal.removeEventListener("abort", finish);
          resolve();
        };

        const timer = window.setTimeout(finish, 1500);
        operation.controller.signal.addEventListener("abort", finish, { once: true });
      });
      result = undefined;
    }

    if (!operation.controller.signal.aborted && pendingId.current === operation.id)
      throw new Error("아직 답변을 기다리고 있습니다. 상태를 다시 확인해주세요.");
  }

  function showFailure(error: Error, id: string) {
    if (pendingId.current !== id) return;
    setFailure(error instanceof Error ? error.message : "AI 응답을 받지 못했습니다.");

    if (error instanceof ApiFailure && [403, 404, 409].includes(error.status)) {
      setBlocked(true);
      waiting(null);
    } else if (
      error instanceof ApiFailure &&
      !cancelled.current.has(id) &&
      !["UNCONFIRMED", "CONNECTION", "TIMEOUT", "INTERRUPTED"].includes(error.code || "")
    ) {
      waiting(null);
    }
  }

  async function cancelRequest(id: string) {
    const previous = active.current;
    const operation: Operation = { id, controller: new AbortController(), phase: "polling" };

    if (previous?.phase !== "submitting") previous?.controller.abort();
    active.current = operation;
    setBusy(true);
    setFailure("");

    try {
      if (!csrf.current) csrf.current = (await session(operation.controller.signal)).csrfToken;

      const first = await api<Reply>(
        path + "/" + id + "/cancel",
        { method: "POST", signal: operation.controller.signal },
        csrf.current,
      );

      previous?.controller.abort();
      await collect(operation, first);
    } catch (error) {
      if (operation.controller.signal.aborted || pendingId.current !== id) return;

      // The original POST may not have reserved its ID yet; cancel again when it returns.
      if (error instanceof ApiFailure && error.status === 404 && previous?.phase === "submitting") {
        active.current = previous;

        return;
      }

      showFailure(error instanceof Error ? error : new Error("AI 응답을 받지 못했습니다."), id);
    } finally {
      if (active.current === operation) setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (!question.trim() || busy || pending || blocked) return;
    const id = crypto.randomUUID();
    const text = question.trim();
    const operation: Operation = { id, controller: new AbortController(), phase: "preparing" };
    active.current?.controller.abort();
    active.current = operation;
    setBusy(true);
    setCancelling(false);
    setFailure("");
    waiting(id);
    setQuestion("");
    setMessages((current) => [...current, { id, role: "user", content: text }]);

    try {
      const identity = await session(operation.controller.signal);

      if (operation.controller.signal.aborted || cancelled.current.has(id)) return;
      const key = await conversationKey(portfolioId, identity.csrfToken);

      if (operation.controller.signal.aborted || cancelled.current.has(id)) return;
      const sameSession = !storageKey.current || storageKey.current === key;
      csrf.current = identity.csrfToken;
      storageKey.current = key;

      if (!sameSession) {
        readConversation(key);
        cancelled.current.clear();
        setMessages([{ id, role: "user", content: text }]);
      }

      const history = (sameSession ? messages : [])
        .filter((message) => !message.cancelled && !cancelled.current.has(message.id))
        .slice(-12)
        .map(({ role, content }) => ({ role, content }));

      while (history.reduce((sum, item) => sum + item.content.length, 0) > 24000) history.shift();
      operation.phase = "submitting";

      const first = await api<Reply>(
        path,
        {
          method: "POST",
          body: JSON.stringify({ requestId: id, question: text, messages: history }),
          signal: operation.controller.signal,
        },
        identity.csrfToken,
      );

      if (pendingId.current !== id || operation.controller.signal.aborted) return;

      if (cancelled.current.has(id)) await cancelRequest(id);
      else {
        operation.phase = "polling";
        await collect(operation, first);
      }
    } catch (error) {
      if (!operation.controller.signal.aborted) {
        if (cancelled.current.has(id)) await cancelRequest(id);
        else
          showFailure(error instanceof Error ? error : new Error("AI 응답을 받지 못했습니다."), id);
      }
    } finally {
      if (active.current === operation) setBusy(false);
    }
  }

  function cancel() {
    const id = pendingId.current;

    if (!id) return;
    cancelled.current.add(id);
    setCancelling(true);

    if (active.current?.phase === "preparing") {
      active.current.controller.abort();
      finishCancellation(id);

      return;
    }

    void cancelRequest(id);
  }

  async function check() {
    const id = pendingId.current;

    if (!id) return;

    if (cancelled.current.has(id)) {
      await cancelRequest(id);

      return;
    }

    const operation: Operation = { id, controller: new AbortController(), phase: "polling" };
    active.current?.controller.abort();
    active.current = operation;
    setBusy(true);
    setFailure("");

    try {
      await collect(operation);
    } catch (error) {
      if (!operation.controller.signal.aborted)
        showFailure(error instanceof Error ? error : new Error("AI 응답을 받지 못했습니다."), id);
    } finally {
      if (active.current === operation) setBusy(false);
    }
  }

  if (!ready) return null;

  return createPortal(
    <div className={styles.widget} data-theme={theme}>
      <button
        ref={launcher}
        className={styles.launcher}
        type="button"
        aria-label="AI 채팅 열기"
        aria-haspopup="dialog"
        aria-expanded={opened}
        onClick={() => setOpened(true)}
      >
        <Bot aria-hidden />
      </button>
      {opened && (
        <dialog
          ref={dialog}
          className={styles.panel}
          aria-labelledby="ai-chat-heading"
          onKeyDown={(event) => {
            if (
              event.key !== "Escape" ||
              (!event.currentTarget.matches(":modal") && document.querySelector("dialog:modal"))
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            setOpened(false);
          }}
          onCancel={(event) => {
            event.preventDefault();
            setOpened(false);
          }}
        >
          <header className={styles.header}>
            <h2 id="ai-chat-heading">
              <Bot aria-hidden /> AI
            </h2>
            <button type="button" aria-label="AI 채팅 닫기" onClick={() => setOpened(false)}>
              <X aria-hidden />
            </button>
          </header>
          <div
            ref={log}
            className={styles.messages}
            role="log"
            aria-label="포트폴리오 AI 대화"
            aria-live="polite"
          >
            {messages.map((message) => (
              <article
                key={message.id}
                className={message.role === "user" ? styles.question : styles.answer}
                data-role={message.role}
              >
                <span className={styles.role}>{message.role === "user" ? "나" : "AI"}</span>
                <div className={styles.bubble}>
                  {message.role === "assistant" && !message.cancelled ? (
                    <AnswerContent content={message.content} onNavigate={followSource} />
                  ) : (
                    <p>{message.content}</p>
                  )}
                  {!!message.sources?.length && (
                    <nav aria-label="검색 근거">
                      {message.sources.map((source) => (
                        <a key={source.id} href={source.url} onClick={followSource}>
                          {source.title} ↗
                        </a>
                      ))}
                    </nav>
                  )}
                </div>
              </article>
            ))}
            {pending && (
              <div className={styles.answer} role="status">
                <span className={styles.role}>AI</span>
                <div className={styles.waiting}>
                  <span className={styles.spinner} aria-hidden />
                  {cancelling ? "취소 요청 중…" : "답변 대기 중…"}
                </div>
              </div>
            )}
          </div>
          {failure && (
            <p className={styles.error} role="alert">
              {failure}
            </p>
          )}
          <form className={styles.composer} onSubmit={(event) => void submit(event)}>
            <label className={styles.label}>
              질문
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={2000}
                rows={3}
                disabled={blocked}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </label>
            <div className={styles.actions}>
              {pending ? (
                <button type="button" onClick={cancel} disabled={cancelling && busy}>
                  <Square aria-hidden /> 취소
                </button>
              ) : (
                <button type="submit" disabled={busy || blocked || !question.trim()}>
                  <Send aria-hidden /> 질문하기
                </button>
              )}
              {pending && !busy && (
                <button type="button" disabled={blocked} onClick={() => void check()}>
                  상태 확인
                </button>
              )}
              <button
                type="button"
                disabled={busy || !!pending}
                onClick={() => {
                  active.current?.controller.abort();
                  cancelled.current.clear();
                  setMessages([]);
                  setQuestion("");
                  setFailure("");
                  setCancelling(false);
                }}
              >
                새 대화
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>,
    document.body,
  );
}
