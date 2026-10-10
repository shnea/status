"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAttachmentAdapter } from "@/features/files/attachments";
import { api, session } from "@/lib/api";
import type { DraftView, SessionView } from "@/features/portfolio/model";
import { useSiteSettings } from "@/features/site/SiteContext";
import { useDraft } from "./useDraft";
import { ProfileEditor } from "./ProfileEditor";
import { SkillsEditor } from "./SkillsEditor";
import { ProjectsEditor } from "./ProjectsEditor";
import { HistoryEditor } from "./HistoryEditor";
import { CertificationsEditor } from "./CertificationsEditor";
import { SettingsEditor } from "./SettingsEditor";
import { PdfExport } from "./PdfExport";
import { AiSettings } from "./AiSettings";
import styles from "./Workspace.module.css";

const statusLabels = {
  saved: "임시저장됨",
  unsaved: "저장 대기 중",
  saving: "저장 중",
  error: "저장 실패",
  conflict: "수정 충돌",
};

export function Workspace({ publicUrl }: { publicUrl: string }) {
  const site = useSiteSettings();
  const [identity, setIdentity] = useState<SessionView | null>(null);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("profile");
  const [fileTransfers, setFileTransfers] = useState(0);
  const filesPending = fileTransfers > 0;

  const activity = useCallback(
    (active: boolean) => setFileTransfers((count) => count + (active ? 1 : -1)),
    [],
  );

  const attachments = useMemo(
    () => createAttachmentAdapter(identity?.member?.id || "", identity?.csrfToken || "", activity),
    [identity?.member?.id, identity?.csrfToken, activity],
  );

  const draft = useDraft(identity?.csrfToken || "", filesPending);
  const logoutForm = useRef<HTMLFormElement>(null);
  const load = draft.load;

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

        if (current.member.suspended) return;

        const saved = await api<DraftView>("/portfolio");

        if (!active) return;

        load(saved);
      } catch (error) {
        if (active)
          setFailure(error instanceof Error ? error.message : "화면을 불러오지 못했습니다.");
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [load]);

  async function publish() {
    setBusy(true);
    setFailure("");

    try {
      const saved = await draft.flush();

      const result = await api<DraftView>(
        "/portfolio/publish",
        {
          method: "POST",
          body: JSON.stringify({ revision: saved.revision }),
        },
        identity?.csrfToken,
      );

      draft.updateRecord(result);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "공개하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    setFailure("");

    try {
      draft.updateRecord(
        await api<DraftView>("/portfolio/unpublish", { method: "POST" }, identity?.csrfToken),
      );
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "비공개로 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function consent(enabled: boolean) {
    setBusy(true);
    setFailure("");

    try {
      await draft.flush();

      const result = await api<DraftView>(
        "/portfolio/ai-consent",
        { method: "PUT", body: JSON.stringify({ enabled }) },
        identity?.csrfToken,
      );

      draft.updateRecord(result);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "AI 설정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function navigate(path: string) {
    setBusy(true);
    setFailure("");

    try {
      if (draft.record) await draft.flush();

      window.location.assign(path);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "저장 후 다시 시도해주세요.");
      setBusy(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl + "/@" + draft.record?.slug);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailure("주소를 복사하지 못했습니다.");
    }
  }

  async function logout(event: React.FormEvent<HTMLFormElement>) {
    if (!draft.record) return;

    event.preventDefault();
    setBusy(true);

    try {
      await draft.flush();
      logoutForm.current?.submit();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "저장 후 다시 로그아웃해주세요.");
      setBusy(false);
    }
  }

  const aiSettings = identity?.member?.aiAllowed && draft.record && (
    <AiSettings
      enabled={draft.record.aiConsent}
      disabled={busy || filesPending}
      change={(enabled) => void consent(enabled)}
    />
  );

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          {site.serviceName}
        </a>
        <div className={styles.headerRight}>
          {identity?.admin && (
            <button disabled={busy || filesPending} onClick={() => void navigate("/admin")}>
              관리자
            </button>
          )}
          {identity?.member && <span>{identity.member.displayName || "내 계정"}</span>}
          {identity && (
            <form ref={logoutForm} action="/logout" method="post" onSubmit={logout}>
              <input type="hidden" name="_csrf" value={identity.csrfToken} />
              <button type="submit" disabled={busy || filesPending}>
                로그아웃
              </button>
            </form>
          )}
        </div>
      </header>
      {failure && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {identity?.member?.suspended ? (
        <h1 className={styles.restricted}>이용이 정지된 계정입니다.</h1>
      ) : draft.document && draft.record ? (
        <>
          <div className={styles.top}>
            <div>
              <h1 className={styles.title}>내 포트폴리오</h1>
              <p className={styles.status} role="status" aria-label="저장 상태">
                {statusLabels[draft.status]}
              </p>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.button}
                disabled={busy || filesPending}
                onClick={() => void draft.save().catch(() => undefined)}
              >
                임시저장
              </button>
              <button
                className={styles.button}
                disabled={busy || filesPending}
                onClick={() => void navigate("/preview")}
              >
                미리보기 ↗
              </button>
              <button
                className={styles.button + " " + styles.primary}
                disabled={busy || filesPending}
                onClick={() => void publish()}
              >
                공개 반영
              </button>
              <PdfExport
                record={draft.record}
                csrf={identity?.csrfToken || ""}
                disabled={busy || filesPending}
                prepare={draft.flush}
                working={setBusy}
              />
              {draft.record.isPublic && (
                <button
                  className={styles.button}
                  disabled={busy || filesPending}
                  onClick={() => void unpublish()}
                >
                  비공개
                </button>
              )}
            </div>
          </div>
          {draft.error && (
            <div className={styles.error} role="alert">
              {draft.error}
              {draft.status === "conflict" && (
                <button
                  className={styles.button}
                  onClick={() => {
                    if (window.confirm("현재 입력을 버리고 저장된 버전을 불러올까요?")) {
                      void api<DraftView>("/portfolio")
                        .then(draft.load)
                        .catch((error: Error) => setFailure(error.message));
                    }
                  }}
                >
                  저장된 버전 불러오기
                </button>
              )}
            </div>
          )}
          <div className={styles.layout}>
            <nav className={styles.nav} aria-label="포트폴리오 편집">
              {[
                ["profile", "01 프로필"],
                ["skills", "02 스킬"],
                ["projects", "03 프로젝트"],
                ["history", "04 히스토리"],
                ["certifications", "05 자격 · 인증"],
                ["settings", "06 설정"],
                ...(identity?.member?.aiAllowed ? [["ai", "07 AI 관리"]] : []),
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? styles.active : undefined}
                  aria-current={tab === id ? "page" : undefined}
                  disabled={busy || filesPending}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <section className={styles.panel}>
              {tab === "profile" && (
                <ProfileEditor
                  attachments={attachments}

                  document={draft.document}
                  portfolioId={draft.record.id}
                  busy={busy}
                  change={draft.change}
                  onError={setFailure}
                />
              )}
              {tab === "skills" && (
                <SkillsEditor
                  document={draft.document}
                  csrfToken={identity?.csrfToken || ""}
                  busy={busy}
                  change={draft.change}
                  onError={setFailure}
                />
              )}
              {tab === "projects" && (
                <ProjectsEditor
                  attachments={attachments}
                  filesPending={filesPending}
                  document={draft.document}
                  busy={busy}
                  change={draft.change}
                  onError={setFailure}
                />
              )}
              {tab === "history" && (
                <HistoryEditor
                  attachments={attachments}
                  filesPending={filesPending}
                  document={draft.document}
                  busy={busy}
                  change={draft.change}
                  onError={setFailure}
                />
              )}
              {tab === "certifications" && (
                <CertificationsEditor document={draft.document} busy={busy} change={draft.change} />
              )}
              {tab === "settings" && (
                <SettingsEditor
                  document={draft.document}
                  busy={busy}
                  change={draft.change}
                  aiSettings={aiSettings}
                />
              )}
              {tab === "ai" && aiSettings}
              {tab === "profile" && (
                <section className={styles.share}>
                  <h2 className={styles.sectionTitle}>공유 주소</h2>
                  <p>
                    <code>
                      {publicUrl}/@{draft.record.slug}
                    </code>
                  </p>
                  <div className={styles.row}>
                    <button className={styles.button} onClick={() => void copyUrl()}>
                      {copied ? "복사됨" : "URL 복사"}
                    </button>
                    <span className={styles.notice}>
                      {draft.record.isPublic ? "공개 중" : "비공개"}
                    </span>
                  </div>
                </section>
              )}
            </section>
          </div>
        </>
      ) : (
        !failure && <p role="status">불러오는 중…</p>
      )}
    </main>
  );
}
