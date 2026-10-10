"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiVoid } from "@/lib/api";
import { createAttachmentAdapter } from "@/features/files/attachments";
import type { SiteConfiguration } from "@/features/site/model";
import { UnusedFilesReview } from "./UnusedFilesReview";
import { SiteSettingsFields } from "./SiteSettingsFields";
import styles from "./AdminConsole.module.css";

interface AiLimits {
  sessionDaily: number;
  portfolioDaily: number;
  globalDaily: number;
  sessionMinute: number;
}

interface SystemSettings {
  aiLimits: AiLimits;
  site?: SiteConfiguration;
}

interface AiUsage {
  total: number;
  completed: number;
  failed: number;
  today: number;
  averageLatencyMs: number | null;
}

interface Audit {
  action: string;
  detail: string;
  targetName: string | null;
  at: string;
}

const fields: { key: keyof AiLimits; title: string }[] = [
  { key: "sessionDaily", title: "방문자 세션 / 일" },
  { key: "portfolioDaily", title: "포트폴리오 / 일" },
  { key: "globalDaily", title: "전체 / 일" },
  { key: "sessionMinute", title: "방문자 세션 / 분" },
];

const actions = {
  suspend: "이용 정지",
  restore: "정지 해제",
  "ai-permission": "AI 사용 허용",
  "skill-create": "공용 스킬 추가",
  "icon-create": "공용 아이콘 추가",
  "skill-update": "공용 스킬 수정",
  design: "디자인 변경",
  "ai-limits": "AI 사용 한도 변경",
  "site-settings": "시스템 설정 변경",
};

export function AdminSettings({ csrf, ownerId }: { csrf: string; ownerId: string }) {
  const router = useRouter();
  const [transfers, setTransfers] = useState(0);

  const activity = useCallback(
    (active: boolean) => setTransfers((count) => count + (active ? 1 : -1)),
    [],
  );

  const attachments = useMemo(
    () => createAttachmentAdapter(ownerId, csrf, activity),
    [ownerId, csrf, activity],
  );

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api<SystemSettings>("/admin/settings", { signal: controller.signal }),
      api<AiUsage>("/admin/ai/usage", { signal: controller.signal }),
      api<Audit[]>("/admin/audit", { signal: controller.signal }),
    ])
      .then(([configuration, counts, entries]) => {
        if (controller.signal.aborted) return;
        setSettings(configuration);
        setUsage(counts);
        setAudit(entries);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setFailure(error.message);
      });

    return () => controller.abort();
  }, [refresh]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!settings || transfers) return;
    setBusy(true);
    setFailure("");
    setMessage("");

    try {
      await apiVoid("/admin/settings", { method: "PUT", body: JSON.stringify(settings) }, csrf);
      setMessage("시스템 설정을 저장했습니다.");
      router.refresh();
      setRefresh((value) => value + 1);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className={styles.sectionHeading}>
        <h2>시스템 설정</h2>
        <button
          className={styles.button}
          disabled={busy || transfers > 0}
          onClick={() => {
            setFailure("");
            setRefresh((value) => value + 1);
          }}
        >
          새로고침
        </button>
      </div>
      {failure && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {usage && (
        <dl className={styles.usage}>
          {[
            ["오늘 요청", usage.today],
            ["전체 요청", usage.total],
            ["완료", usage.completed],
            ["실패", usage.failed],
            ["평균 응답", usage.averageLatencyMs === null ? "—" : usage.averageLatencyMs + " ms"],
          ].map(([title, count]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{count}</dd>
            </div>
          ))}
        </dl>
      )}
      {settings && (
        <form onSubmit={(event) => void save(event)}>
          {settings.site && (
            <SiteSettingsFields
              value={settings.site}
              change={(site) => setSettings({ ...settings, site })}
              attachments={attachments}
              busy={busy}
            />
          )}
          <h3>AI 사용 한도</h3>
          <div className={styles.formGrid}>
            {fields.map(({ key, title }) => (
              <label className={styles.field} key={key}>
                {title}
                <input
                  className={styles.input}
                  required
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  value={settings.aiLimits[key]}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      aiLimits: { ...settings.aiLimits, [key]: event.target.valueAsNumber || 0 },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <button className={styles.button + " " + styles.primary} disabled={busy || transfers > 0}>
            설정 저장
          </button>
        </form>
      )}
      <UnusedFilesReview />
      <div className={styles.sectionHeading + " " + styles.auditHeading}>
        <h3>관리 변경 기록</h3>
        <span>최근 100개</span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>일시</th>
              <th>변경</th>
              <th>대상</th>
              <th>내용</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((entry, index) => (
              <tr key={entry.at + index}>
                <td>{new Date(entry.at).toLocaleString("ko-KR")}</td>
                <td>
                  {Object.entries(actions).find(([action]) => action === entry.action)?.[1] ??
                    entry.action}
                </td>
                <td>{entry.targetName || "—"}</td>
                <td>
                  {entry.action === "suspend" || entry.action === "restore"
                    ? entry.detail || "—"
                    : entry.action === "ai-permission"
                      ? entry.detail === "true"
                        ? "허용"
                        : "해제"
                      : "—"}
                </td>
              </tr>
            ))}
            {audit.length === 0 && (
              <tr>
                <td colSpan={4}>변경 기록이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
