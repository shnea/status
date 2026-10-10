"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiVoid } from "@/lib/api";
import type { SessionView } from "@/features/portfolio/model";
import styles from "./AdminConsole.module.css";

type AdminChange = { enabled: boolean } | { suspended: boolean; reason: string };

interface AdminUser {
  id: string;
  name: string;
  slug: string;
  suspended: boolean;
  reason: string | null;
  aiAllowed: boolean;
  public: boolean;
  joinedAt: string;
  views: number;
  visitors: number;
}

export function AdminUsers({
  identity,
  changed,
  statistics,
  ai,
}: {
  identity: SessionView;
  changed: () => void;
  statistics: (id: string, name: string) => void;
  ai: (id: string, name: string) => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (target) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      previousFocus.current?.focus();
    }
  }, [target]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void api<AdminUser[]>("/admin/users?q=" + encodeURIComponent(filter) + "&page=" + page, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setUsers(result);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setFailure(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filter, page, refresh]);

  async function change(path: string, input: AdminChange, success: string) {
    setBusy(true);
    setFailure("");
    setMessage("");

    try {
      await apiVoid(path, { method: "PUT", body: JSON.stringify(input) }, identity.csrfToken);
      setMessage(success);
      setTarget(null);
      setReason("");
      setRefresh((value) => value + 1);
      changed();

      return true;
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "상태를 변경하지 못했습니다.");

      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleAi(user: AdminUser, enabled: boolean) {
    setUsers((current) =>
      current.map((item) => (item.id === user.id ? { ...item, aiAllowed: enabled } : item)),
    );

    const saved = await change(
      "/admin/users/" + user.id + "/ai",
      { enabled },
      enabled ? "AI 사용을 허용했습니다." : "AI 사용 허용을 해제했습니다.",
    );

    if (!saved)
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, aiAllowed: user.aiAllowed } : item,
        ),
      );
  }

  return (
    <section>
      <div className={styles.sectionHeading}>
        <h2>사용자 관리</h2>
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            setFailure("");
            setFilter(query);
            setPage(0);
          }}
        >
          <input
            className={styles.input}
            aria-label="사용자 검색"
            placeholder="이름 또는 공유 주소"
            maxLength={100}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={busy}
          />
          <button className={styles.button} disabled={busy}>
            검색
          </button>
        </form>
      </div>
      {failure && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className={styles.tableScroll} aria-busy={loading}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>사용자</th>
              <th>공유 주소</th>
              <th>가입일</th>
              <th>상태</th>
              <th>조회 / 방문</th>
              <th>AI 허용</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.name || "이름 미등록"}
                  {user.id === identity.member?.id && (
                    <span className={styles.adminBadge}>관리자</span>
                  )}
                </td>
                <td>
                  {user.public && !user.suspended ? (
                    <a href={"/@" + user.slug} target="_blank" rel="noopener">
                      {"@" + user.slug} ↗
                    </a>
                  ) : (
                    "@" + user.slug
                  )}
                </td>
                <td>{new Date(user.joinedAt).toLocaleDateString("ko-KR")}</td>
                <td>
                  {user.suspended ? (
                    <>
                      <span className={styles.error}>이용 정지</span>
                      <small className={styles.reason}>{user.reason}</small>
                    </>
                  ) : user.public ? (
                    "공개"
                  ) : (
                    "비공개"
                  )}
                </td>
                <td>
                  {user.views ?? 0} / {user.visitors ?? 0}
                </td>
                <td>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={user.aiAllowed ?? false}
                      disabled={busy || loading}
                      aria-label={user.name + " AI 사용 허용"}
                      onChange={(event) => void toggleAi(user, event.target.checked)}
                    />
                    허용
                  </label>
                </td>
                <td>
                  <button
                    className={styles.button}
                    disabled={busy}
                    onClick={() => statistics(user.id, user.name || user.slug)}
                    aria-label={user.name + " 통계"}
                  >
                    통계
                  </button>
                  <button
                    className={styles.button}
                    disabled={busy}
                    onClick={() => ai(user.id, user.name || "@" + user.slug)}
                    aria-label={user.name + " AI 관리"}
                  >
                    AI 관리
                  </button>
                  {user.id !== identity.member?.id && (
                    <button
                      className={styles.button}
                      disabled={busy || loading}
                      onClick={() => {
                        setReason("");
                        setTarget(user);
                      }}
                    >
                      {user.suspended ? "정지 해제" : "이용 정지"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7}>검색 결과가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className={styles.pagination} aria-label="사용자 목록 페이지">
        <button
          className={styles.button}
          disabled={page === 0 || busy || loading}
          onClick={() => setPage(page - 1)}
        >
          이전
        </button>
        <span>{page + 1}</span>
        <button
          className={styles.button}
          disabled={users.length < 30 || busy || loading}
          onClick={() => setPage(page + 1)}
        >
          다음
        </button>
      </nav>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="suspension-title"
        onCancel={(event) => {
          event.preventDefault();

          if (!busy) setTarget(null);
        }}
      >
        {target && (
          <>
            <h2 id="suspension-title">{target.suspended ? "이용 정지 해제" : "이용 정지"}</h2>
            <p>{target.name || target.slug}</p>
            <p>
              {target.suspended
                ? "해제 후에도 포트폴리오는 비공개로 유지됩니다."
                : "공개 포트폴리오와 기존 로그인 세션의 작성 권한이 차단됩니다."}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void change(
                  "/admin/users/" + target.id + "/suspension",
                  { suspended: !target.suspended, reason },
                  target.suspended
                    ? "이용 정지를 해제했습니다. 포트폴리오는 비공개 상태입니다."
                    : "이용을 정지했습니다.",
                );
              }}
            >
              {!target.suspended && (
                <label className={styles.field}>
                  정지 사유
                  <textarea
                    className={styles.input}
                    autoFocus
                    required
                    maxLength={500}
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              )}
              <div className={styles.dialogActions}>
                <button
                  className={styles.button}
                  type="button"
                  disabled={busy}
                  onClick={() => setTarget(null)}
                >
                  취소
                </button>
                <button className={styles.button + " " + styles.primary} disabled={busy}>
                  {target.suspended ? "해제" : "정지"}
                </button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </section>
  );
}
