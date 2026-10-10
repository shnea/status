"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import styles from "./AdminConsole.module.css";

interface Day {
  date: string;
  views: number;
  sessions: number;
  registrations: number;
  publications: number;
}

interface Report {
  days: number;
  memberId: string | null;
  daily: Day[];
}

export interface StatisticsTarget {
  id: string;
  name: string;
}

export function AdminStatistics({
  target,
  clear,
}: {
  target: StatisticsTarget | null;
  clear: () => void;
}) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure("");
    setReport(null);
    void api<Report>("/admin/statistics?days=" + days + (target ? "&memberId=" + target.id : ""), {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setReport(result);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setFailure(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [days, target?.id]);

  const totals = report?.daily.reduce(
    (sum, day) => ({
      views: sum.views + day.views,
      sessions: sum.sessions + day.sessions,
      registrations: sum.registrations + day.registrations,
      publications: sum.publications + day.publications,
    }),
    { views: 0, sessions: 0, registrations: 0, publications: 0 },
  );

  return (
    <section>
      <div className={styles.sectionHeading}>
        <h2>{target ? target.name + " 통계" : "전체 통계"}</h2>
        <div className={styles.actions}>
          {target && (
            <button className={styles.button} onClick={clear}>
              전체 통계 보기
            </button>
          )}
          <label className={styles.check}>
            기간
            <select
              className={styles.input}
              aria-label="통계 기간"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>7일</option>
              <option value={30}>30일</option>
              <option value={90}>90일</option>
            </select>
          </label>
        </div>
      </div>
      {failure && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {loading && <p role="status">불러오는 중…</p>}
      {totals && (
        <dl className={styles.usage}>
          {[
            ["조회수", totals.views],
            ["일별 방문 세션 합계", totals.sessions],
            ["가입", totals.registrations],
            ["공개 반영", totals.publications],
          ].map(([label, count]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{count}</dd>
            </div>
          ))}
        </dl>
      )}
      {report && (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>날짜 (한국 시간)</th>
                <th>조회수</th>
                <th>방문 세션</th>
                <th>가입</th>
                <th>공개 반영</th>
              </tr>
            </thead>
            <tbody>
              {[...report.daily].reverse().map((day) => (
                <tr key={day.date}>
                  <td>{day.date}</td>
                  <td>{day.views}</td>
                  <td>{day.sessions}</td>
                  <td>{day.registrations}</td>
                  <td>{day.publications}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
