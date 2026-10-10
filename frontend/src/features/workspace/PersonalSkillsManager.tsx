"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { IconRef, SearchPage } from "@/features/portfolio/model";
import { IconAsset } from "@/features/catalog/IconAsset";
import { IconPicker } from "@/features/catalog/IconPicker";
import { EditDialog } from "./EditDialog";
import styles from "./Workspace.module.css";

interface PersonalSkill {
  id: string;
  name: string;
  category: string;
  icon: IconRef;
  active: boolean;
}

export function PersonalSkillsManager({
  csrf,
  busy,
  changed,
}: {
  csrf: string;
  busy: boolean;
  changed: (skill: PersonalSkill) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PersonalSkill[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [edit, setEdit] = useState<PersonalSkill | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void api<SearchPage<PersonalSkill>>(
        "/catalog/personal-skills?q=" + encodeURIComponent(query) + "&page=" + page,
        { signal: controller.signal },
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setItems(result.items);
            setMore(result.hasMore);
            setFailure("");
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setFailure(error instanceof Error ? error.message : "개인 스킬을 불러오지 못했습니다.");
        });
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, page, refresh]);

  async function save(event: React.FormEvent) {
    event.preventDefault();

    if (!edit) return;
    setSaving(true);
    setFailure("");

    try {
      const result = await api<PersonalSkill>(
        "/catalog/skills/" + edit.id,
        {
          method: "PUT",
          body: JSON.stringify({
            name: edit.name,
            category: edit.category,
            icon: edit.icon,
            active: edit.active,
          }),
        },
        csrf,
      );

      changed(result);
      setEdit(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "개인 스킬을 수정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        className={styles.button}
        disabled={busy}
        onClick={() => {
          setFailure("");
          setOpen(true);
        }}
      >
        개인 스킬 관리
      </button>
      <EditDialog
        open={open}
        title="개인 스킬 관리"
        busy={saving || !!edit}
        close={() => setOpen(false)}
      >
        <input
          type="search"
          className={styles.input}
          aria-label="개인 스킬 검색"
          maxLength={100}
          value={query}
          disabled={!!edit || saving}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        {failure && !edit && (
          <p className={styles.error} role="alert">
            {failure}
          </p>
        )}
        <ul className={styles.searchResults}>
          {items.map((item) => (
            <li key={item.id}>
              <button
                disabled={!!edit || saving}
                onClick={() => {
                  setFailure("");
                  setEdit(item);
                }}
                aria-label={item.name + " 개인 스킬 편집"}
              >
                <IconAsset icon={item.icon} name={item.name} className={styles.skillIcon} />
                <span>
                  {item.name}
                  <small>
                    {item.category}
                    {!item.active && " · 신규 선택 중단"}
                  </small>
                </span>
                <span>편집</span>
              </button>
            </li>
          ))}
        </ul>
        {!items.length && <p>등록한 개인 스킬이 없습니다.</p>}
        <div className={styles.dialogActions}>
          <button
            className={styles.button}
            disabled={page === 0 || !!edit || saving}
            onClick={() => setPage(page - 1)}
          >
            이전
          </button>
          <span>{page + 1}</span>
          <button
            className={styles.button}
            disabled={!more || !!edit || saving}
            onClick={() => setPage(page + 1)}
          >
            다음
          </button>
        </div>
      </EditDialog>
      <EditDialog open={!!edit} title="개인 스킬 편집" busy={saving} close={() => setEdit(null)}>
        {edit && (
          <form onSubmit={(event) => void save(event)}>
            <fieldset className={styles.fieldset} disabled={saving}>
              <label className={styles.field}>
                스킬명
                <input
                  className={styles.input}
                  required
                  maxLength={100}
                  value={edit.name}
                  onChange={(event) => setEdit({ ...edit, name: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                카테고리
                <input
                  className={styles.input}
                  required
                  maxLength={60}
                  value={edit.category}
                  onChange={(event) => setEdit({ ...edit, category: event.target.value })}
                />
              </label>
              <IconPicker
                value={edit.icon}
                name={edit.name}
                change={(icon) => setEdit({ ...edit, icon })}
                disabled={saving}
              />
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={edit.active}
                  onChange={(event) => setEdit({ ...edit, active: event.target.checked })}
                />
                신규 선택 허용
              </label>
            </fieldset>
            {failure && (
              <p className={styles.error} role="alert">
                {failure}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button className={styles.button + " " + styles.primary} disabled={saving}>
                저장
              </button>
            </div>
          </form>
        )}
      </EditDialog>
    </>
  );
}
