"use client";

import { useEffect, useState } from "react";
import { api, apiVoid } from "@/lib/api";
import type { DesignSetting } from "@/features/templates/model";
import { samplePaths } from "@/features/templates/model";
import styles from "./AdminConsole.module.css";

export function AdminDesigns({ csrf }: { csrf: string }) {
  const [items, setItems] = useState<DesignSetting[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void api<DesignSetting[]>("/admin/designs", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setItems(value);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setFailure(error.message);
      });

    return () => controller.abort();
  }, [refresh]);

  async function change(item: DesignSetting, enabled: boolean, isDefault: boolean) {
    setBusy(true);
    setFailure("");
    setMessage("");

    try {
      await apiVoid(
        "/admin/designs/" + item.id,
        { method: "PUT", body: JSON.stringify({ enabled, isDefault }) },
        csrf,
      );
      setRefresh((value) => value + 1);
      setMessage("디자인 설정을 저장했습니다.");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "디자인을 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className={styles.sectionHeading}>
        <h2>디자인 관리</h2>
      </div>
      {failure && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <ul className={styles.designs}>
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <span>
                {item.implemented ? (item.isDefault ? "기본 디자인" : "사용 가능") : "준비 중"}
              </span>
            </div>
            <div className={styles.actions}>
              {item.implemented && samplePaths.has(item.id) && (
                <a
                  className={styles.button}
                  href={samplePaths.get(item.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  미리보기 ↗
                </a>
              )}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  aria-label={item.title + " 사용 허용"}
                  disabled={busy || !item.implemented || item.isDefault}
                  onChange={(event) => void change(item, event.target.checked, false)}
                />
                사용 허용
              </label>
              <button
                className={styles.button}
                disabled={busy || !item.implemented || item.isDefault}
                onClick={() => void change(item, true, true)}
              >
                기본으로 지정
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
