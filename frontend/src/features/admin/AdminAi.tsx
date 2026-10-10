"use client";

import { useEffect, useState } from "react";
import { api, apiVoid } from "@/lib/api";
import styles from "./AdminConsole.module.css";

interface IndexJob {
  id: string;
  portfolioId: string;
  revision: number;
  status: string;
  collection: string | null;
  remoteId: string | null;
  batch: number;
  errorCode: string | null;
  createdAt: string;
  totalDocuments: number;
  cleanupState: string | null;
  memberId: string;
  slug: string;
}

interface Administration {
  enabled: boolean;
  jobs: IndexJob[];
  summary: Record<string, number>;
  batches: {
    id: string;
    targets: number;
    completed: number;
    failed: number;
    pending: number;
    superseded: number;
    createdAt: string;
  }[];
}

const statuses = {
  queued: "대기",
  running: "색인 중",
  waiting: "플랫폼 처리 중",
  ready: "완료",
  failed: "실패",
  unconfirmed: "접수 확인 필요",
  superseded: "공개 버전 변경 · 권한 철회",
};

const errors = {
  PLATFORM_PERMISSION: "플랫폼 권한 확인",
  PROVIDER_LIMIT: "제공자 한도",
  TIMEOUT: "시간 초과",
  UNAVAILABLE: "서비스 연결 확인",
  CONNECTION: "통신 실패",
  INVALID_RESPONSE: "응답 계약 확인",
  INDEX_FAILED: "플랫폼 색인 실패",
  INVALID_DOCUMENT: "문서 크기·형식 확인",
};

export function AdminAi({
  csrf,
  initialTarget,
}: {
  csrf: string;
  initialTarget: { id: string; name: string } | null;
}) {
  const [state, setState] = useState<Administration | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState(initialTarget);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await api<Administration>("/admin/ai");

        if (active) setState(result);
      } catch (error) {
        if (active)
          setFailure(error instanceof Error ? error.message : "AI 상태를 불러오지 못했습니다.");
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function toggle(enabled: boolean) {
    const previous = state?.enabled;
    setState((current) => (current ? { ...current, enabled } : current));
    setBusy(true);
    setFailure("");

    try {
      await apiVoid(
        "/admin/ai/enabled",
        { method: "PUT", body: JSON.stringify({ enabled }) },
        csrf,
      );
      setRefresh((value) => value + 1);
    } catch (error) {
      if (previous !== undefined)
        setState((current) => (current ? { ...current, enabled: previous } : current));
      setFailure(error instanceof Error ? error.message : "AI 전체 설정을 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function reindex(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    setMessage("");

    try {
      const result = await api<{ queued: number }>(
        "/admin/ai/reindex",
        { method: "POST", body: JSON.stringify({ memberId: target?.id || null }) },
        csrf,
      );

      setMessage(result.queued + "개 포트폴리오의 재색인을 접수했습니다.");
      setRefresh((value) => value + 1);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "재색인을 접수하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function retry(job: IndexJob) {
    setBusy(true);
    setFailure("");

    try {
      if (job.status === "unconfirmed" || job.cleanupState === "unconfirmed") {
        await apiVoid("/admin/ai/jobs/" + job.id + "/recover", { method: "POST" }, csrf);
        setMessage("기존 접수 상태를 복구했습니다.");
      } else {
        const result = await api<{ queued: number }>(
          "/admin/ai/reindex",
          { method: "POST", body: JSON.stringify({ memberId: job.memberId }) },
          csrf,
        );

        setMessage(result.queued + "개 재색인을 접수했습니다.");
      }

      setRefresh((value) => value + 1);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "작업 상태를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className={styles.sectionTitle}>AI 관리</h2>
      {failure && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {state && (
        <>
          <dl className={styles.usage}>
            {[
              ["전체 작업", Object.values(state.summary).reduce((sum, count) => sum + count, 0)],
              ["완료", state.summary.ready || 0],
              ["실패", state.summary.failed || 0],
              ["접수 확인 필요", state.summary.unconfirmed || 0],
            ].map(([title, count]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={state.enabled}
              disabled={busy}
              onChange={(event) => void toggle(event.target.checked)}
            />
            전체 AI 사용
          </label>
          <form className={styles.formGrid} onSubmit={(event) => void reindex(event)}>
            <div className={styles.field}>
              <span>재색인 대상</span>
              <strong>{target?.name || "전체 포트폴리오"}</strong>
              {target && (
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => setTarget(null)}
                >
                  전체 대상 선택
                </button>
              )}
            </div>
            <button className={styles.button} disabled={busy || !state.enabled}>
              재색인
            </button>
          </form>
          <h3 className={styles.auditHeading}>재색인 실행</h3>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>접수일</th>
                  <th>대상</th>
                  <th>완료</th>
                  <th>실패·확인 필요</th>
                  <th>진행</th>
                  <th>버전 변경·철회</th>
                </tr>
              </thead>
              <tbody>
                {state.batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{new Date(batch.createdAt).toLocaleString("ko-KR")}</td>
                    <td>{batch.targets}</td>
                    <td>{batch.completed}</td>
                    <td>{batch.failed}</td>
                    <td>{batch.pending}</td>
                    <td>{batch.superseded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className={styles.auditHeading}>최근 색인 작업 · 최대 100건</h3>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>포트폴리오</th>
                  <th>공개 버전</th>
                  <th>상태</th>
                  <th>처리 문서</th>
                  <th>접수일</th>
                  <th>동작</th>
                </tr>
              </thead>
              <tbody>
                {state.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <a href={"/@" + job.slug} target="_blank" rel="noopener noreferrer">
                        @{job.slug}
                      </a>
                    </td>
                    <td>{job.revision}</td>
                    <td>
                      {Object.entries(statuses).find(([key]) => key === job.status)?.[1] ||
                        "처리 상태 확인"}
                      {job.errorCode &&
                        " · " +
                          (Object.entries(errors).find(([key]) => key === job.errorCode)?.[1] ||
                            "처리 상태 확인")}
                    </td>
                    <td>
                      {Math.min(job.batch * 30, job.totalDocuments)} / {job.totalDocuments}
                    </td>
                    <td>{new Date(job.createdAt).toLocaleString("ko-KR")}</td>
                    <td>
                      {(job.status === "failed" ||
                        job.status === "unconfirmed" ||
                        job.cleanupState === "unconfirmed") && (
                        <button
                          className={styles.button}
                          disabled={busy}
                          onClick={() => void retry(job)}
                        >
                          {job.status === "failed" ? "재시도" : "접수 확인"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!state.jobs.length && <p>색인 작업이 없습니다.</p>}
        </>
      )}
    </section>
  );
}
