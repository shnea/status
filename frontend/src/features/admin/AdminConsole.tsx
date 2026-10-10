"use client";

import { useEffect, useState } from "react";
import { api, session } from "@/lib/api";
import { useSiteSettings } from "@/features/site/SiteContext";
import type { SessionView } from "@/features/portfolio/model";
import { AdminUsers } from "./AdminUsers";
import { AdminSkills } from "./AdminSkills";
import { AdminDesigns } from "./AdminDesigns";
import { AdminAi } from "./AdminAi";
import { AdminSettings } from "./AdminSettings";
import { AdminStatistics, type StatisticsTarget } from "./AdminStatistics";
import styles from "./AdminConsole.module.css";

interface Overview {
  users: number;
  suspended: number;
  publicPortfolios: number;
  views: number;
  visitors: number;
}

const panels = [
  { id: "users", title: "사용자 관리" },
  { id: "skills", title: "스킬 사전" },
  { id: "designs", title: "디자인 관리" },
  { id: "ai", title: "AI 관리" },
  { id: "settings", title: "시스템 설정" },
  { id: "statistics", title: "통계" },
] as const;

type Panel = (typeof panels)[number]["id"];

export function AdminConsole() {
  const site = useSiteSettings();
  const [identity, setIdentity] = useState<SessionView | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [panel, setPanel] = useState<Panel>("users");
  const [refresh, setRefresh] = useState(0);
  const [aiTarget, setAiTarget] = useState<{ id: string; name: string } | null>(null);
  const [statisticsTarget, setStatisticsTarget] = useState<StatisticsTarget | null>(null);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const current = await session();

        if (!active) return;

        if (!current.member) {
          window.location.replace("/login");

          return;
        }

        setIdentity(current);

        if (!current.admin) return;
        const result = await api<Overview>("/admin/overview");

        if (active) {
          setOverview(result);
          setFailure("");
        }
      } catch (error) {
        if (active)
          setFailure(error instanceof Error ? error.message : "관리자 화면을 불러오지 못했습니다.");
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [refresh]);

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          {site.serviceName}
        </a>
        <a href="/dashboard">내 포트폴리오 ↗</a>
      </header>
      <h1 className={styles.title}>관리자</h1>
      {failure && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {identity && !identity.admin ? (
        <p role="alert">관리자 권한이 필요합니다.</p>
      ) : overview && identity ? (
        <>
          <dl className={styles.metrics}>
            {[
              ["가입자", overview.users],
              ["공개 포트폴리오", overview.publicPortfolios],
              ["이용 정지", overview.suspended],
              ["조회수", overview.views ?? 0],
              ["일별 방문 세션", overview.visitors ?? 0],
            ].map(([title, count]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <nav className={styles.tabs} aria-label="관리자 메뉴">
            {panels.map((item) => (
              <button
                key={item.id}
                className={styles.button}
                aria-current={panel === item.id ? "page" : undefined}
                onClick={() => setPanel(item.id)}
              >
                {item.title}
              </button>
            ))}
          </nav>
          {panel === "users" && (
            <AdminUsers
              identity={identity}
              changed={() => setRefresh((value) => value + 1)}
              ai={(id, name) => {
                setAiTarget({ id, name });
                setPanel("ai");
              }}
              statistics={(id, name) => {
                setStatisticsTarget({ id, name });
                setPanel("statistics");
              }}
            />
          )}
          {panel === "skills" && <AdminSkills csrf={identity.csrfToken} />}
          {panel === "designs" && <AdminDesigns csrf={identity.csrfToken} />}
          {panel === "ai" && <AdminAi csrf={identity.csrfToken} initialTarget={aiTarget} />}
          {panel === "settings" && (
            <AdminSettings csrf={identity.csrfToken} ownerId={identity.member?.id || ""} />
          )}
          {panel === "statistics" && (
            <AdminStatistics target={statisticsTarget} clear={() => setStatisticsTarget(null)} />
          )}
        </>
      ) : (
        !failure && <p role="status">불러오는 중…</p>
      )}
    </main>
  );
}
