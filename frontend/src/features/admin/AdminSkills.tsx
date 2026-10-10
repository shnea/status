"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiVoid } from "@/lib/api";
import { IconPicker } from "@/features/catalog/IconPicker";
import { IconAsset } from "@/features/catalog/IconAsset";
import type { IconRef, SearchPage } from "@/features/portfolio/model";
import { AddCatalogIcon } from "./AddCatalogIcon";
import styles from "./AdminConsole.module.css";

interface CatalogSkill {
  id: string;
  name: string;
  category: string;
  icon: IconRef;
  active: boolean;
  aliases: string[];
}

interface SkillForm {
  id: string | null;
  name: string;
  category: string;
  icon: IconRef;
  active: boolean;
  aliases: string;
}

const blank: SkillForm = {
  id: null,
  name: "",
  category: "",
  icon: { provider: "initials", key: "", hex: "", monochromeAllowed: true },
  active: true,
  aliases: "",
};

export function AdminSkills({ csrf }: { csrf: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<SearchPage<CatalogSkill>>({ items: [], hasMore: false });
  const [form, setForm] = useState<SkillForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const open = form !== null;

  useEffect(() => {
    if (open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      previousFocus.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void api<SearchPage<CatalogSkill>>(
      "/admin/skills?q=" + encodeURIComponent(filter) + "&page=" + page,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setFailure(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filter, page, refresh]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form) return;
    setBusy(true);
    setFailure("");
    setMessage("");

    const input = {
      name: form.name.trim(),
      category: form.category.trim(),
      icon: form.icon,
      aliases: [
        ...new Set(
          form.aliases
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ],
      active: form.active,
    };

    try {
      const path = "/admin/skills" + (form.id ? "/" + form.id : "");
      await apiVoid(path, { method: form.id ? "PUT" : "POST", body: JSON.stringify(input) }, csrf);
      setForm(null);
      setMessage("스킬 사전을 저장했습니다.");
      setRefresh((value) => value + 1);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "스킬을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className={styles.sectionHeading}>
        <h2>스킬 사전</h2>
        <div className={styles.actions}>
          <AddCatalogIcon csrf={csrf} created={() => setMessage("공용 아이콘을 추가했습니다.")} />
          <button
            className={styles.button}
            onClick={() => {
              setFailure("");
              setForm({ ...blank });
            }}
          >
            공용 스킬 추가
          </button>
        </div>
      </div>
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          setFilter(query);
          setPage(0);
          setFailure("");
        }}
      >
        <input
          className={styles.input}
          type="search"
          aria-label="공용 스킬 검색"
          maxLength={100}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className={styles.button}>검색</button>
      </form>
      {failure && !form && (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <ul className={styles.catalog} aria-busy={loading}>
        {result.items.map((item) => (
          <li key={item.id}>
            <IconAsset icon={item.icon} name={item.name} className={styles.glyph} />
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.category} · {item.active ? "사용 가능" : "신규 선택 중단"}
              </small>
            </div>
            <button
              className={styles.button}
              onClick={() => {
                setFailure("");
                setForm({ ...item, aliases: (item.aliases ?? []).join("\n") });
              }}
              aria-label={item.name + " 편집"}
            >
              편집
            </button>
          </li>
        ))}
      </ul>
      {!loading && !failure && result.items.length === 0 && <p>검색 결과가 없습니다.</p>}
      <nav className={styles.pagination} aria-label="공용 스킬 목록 페이지">
        <button
          className={styles.button}
          disabled={loading || page === 0}
          onClick={() => setPage(page - 1)}
        >
          이전
        </button>
        <span>{page + 1}</span>
        <button
          className={styles.button}
          disabled={loading || !result.hasMore}
          onClick={() => setPage(page + 1)}
        >
          다음
        </button>
      </nav>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label={form?.id ? "공용 스킬 편집" : "공용 스킬 추가"}
        onCancel={(event) => {
          event.preventDefault();

          if (!busy) setForm(null);
        }}
      >
        {form && (
          <form onSubmit={(event) => void save(event)}>
            <h2>{form.id ? "공용 스킬 편집" : "공용 스킬 추가"}</h2>
            <label className={styles.field}>
              스킬명
              <input
                className={styles.input}
                autoFocus
                required
                maxLength={100}
                value={form.name}
                disabled={busy}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              카테고리
              <input
                className={styles.input}
                required
                maxLength={60}
                value={form.category}
                disabled={busy}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
            </label>
            <IconPicker
              value={form.icon}
              name={form.name}
              disabled={busy}
              change={(icon) => setForm({ ...form, icon })}
            />
            <label className={styles.field}>
              검색 별칭 (한 줄에 하나)
              <textarea
                className={styles.input}
                rows={3}
                value={form.aliases}
                disabled={busy}
                onChange={(event) => setForm({ ...form, aliases: event.target.value })}
              />
            </label>
            {form.id && (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.active}
                  disabled={busy}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                />
                신규 선택 허용
              </label>
            )}
            {failure && (
              <p className={styles.error} role="alert">
                {failure}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                className={styles.button}
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                취소
              </button>
              <button className={styles.button + " " + styles.primary} disabled={busy}>
                저장
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
