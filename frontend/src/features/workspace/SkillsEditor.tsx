"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { IconRef, PortfolioDocument, SearchPage, Skill } from "@/features/portfolio/model";
import { sortedSkills } from "@/features/portfolio/model";
import { IconAsset } from "@/features/catalog/IconAsset";
import { IconPicker } from "@/features/catalog/IconPicker";
import { PersonalSkillsManager } from "./PersonalSkillsManager";
import styles from "./Workspace.module.css";

interface SkillEntry extends Omit<Skill, "featured"> {
  personal: boolean;
  active: boolean;
}

const automatic: IconRef = { provider: "initials", key: "", hex: "", monochromeAllowed: true };

export function SkillsEditor({
  document,
  csrfToken,
  busy,
  change,
  onError,
}: {
  document: PortfolioDocument;
  csrfToken: string;
  busy: boolean;
  change: (update: (current: PortfolioDocument) => PortfolioDocument) => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [pageNumber, setPageNumber] = useState(0);
  const [results, setResults] = useState<SkillEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [icon, setIcon] = useState<IconRef>(automatic);
  const [formError, setFormError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const wasCreating = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSearchError("");

    const timer = window.setTimeout(() => {
      void api<SearchPage<SkillEntry>>(
        "/catalog/skills?q=" + encodeURIComponent(query) + "&page=" + pageNumber,
        { signal: controller.signal },
      )
        .then((result) => {
          if (controller.signal.aborted) return;

          setResults((current) =>
            pageNumber === 0 ? result.items : [...current, ...result.items],
          );
          setHasMore(result.hasMore);
        })
        .catch((failure: Error) => {
          if (!controller.signal.aborted) setSearchError(failure.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, pageNumber]);

  useEffect(() => {
    if (creating) {
      dialog.current?.showModal();
      nameInput.current?.focus();
    } else {
      dialog.current?.close();

      if (wasCreating.current) addButton.current?.focus();
    }

    wasCreating.current = creating;
  }, [creating]);

  function select(item: SkillEntry) {
    change((current) => {
      if (current.skills.some((skill) => skill.id === item.id)) return current;

      return {
        ...current,
        skills: [
          ...current.skills,
          {
            id: item.id,
            name: item.name,
            category: item.category,
            icon: item.icon,
            featured: false,
          },
        ],
      };
    });
  }

  function move(id: string, featured: boolean) {
    onError("");

    if (featured && document.skills.filter((skill) => skill.featured).length >= 10) {
      onError("대표 스킬은 최대 10개입니다.");

      return;
    }

    change((current) => ({
      ...current,
      skills: current.skills.map((skill) => (skill.id === id ? { ...skill, featured } : skill)),
    }));
  }

  function remove(skill: Skill) {
    const links = document.projects.filter((project) => project.skillIds.includes(skill.id)).length;

    if (
      !window.confirm(
        links > 0
          ? skill.name + "을 삭제하고 프로젝트 " + links + "개의 스킬 연결도 해제할까요?"
          : skill.name + "을 선택 목록에서 삭제할까요?",
      )
    )
      return;

    change((current) => ({
      ...current,
      skills: current.skills.filter((item) => item.id !== skill.id),
      projects: current.projects.map((project) => ({
        ...project,
        skillIds: project.skillIds.filter((id) => id !== skill.id),
      })),
    }));
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const item = await api<SkillEntry>(
        "/catalog/skills",
        {
          method: "POST",
          body: JSON.stringify({ name, category, icon }),
        },
        csrfToken,
      );

      select(item);
      setResults((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
      setCreating(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "스킬을 등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const selected = new Set(document.skills.map((skill) => skill.id));

  return (
    <section aria-label="스킬 편집">
      <h2 className={styles.sectionTitle}>스킬</h2>
      <fieldset disabled={busy} className={styles.fieldset}>
        <div className={styles.skillLists}>
          {[true, false].map((featured) => {
            const skills = sortedSkills(
              document.skills.filter((skill) => skill.featured === featured),
            );

            const categories = [...new Set(skills.map((skill) => skill.category))];

            return (
              <section
                key={String(featured)}
                className={styles.skillList}
                aria-label={featured ? "대표 스킬" : "일반 스킬"}
                onDragOver={(event) => {
                  if (!busy) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("application/x-status-skill");

                  if (
                    !busy &&
                    document.skills.some((skill) => skill.id === id && skill.featured !== featured)
                  )
                    move(id, featured);
                }}
              >
                <h3>
                  {featured
                    ? "대표 스킬 · " + skills.length + "/10"
                    : "일반 스킬 · " + skills.length}
                </h3>
                {categories.map((group) => (
                  <div key={group}>
                    <h4>{group}</h4>
                    <ul className={styles.selectedSkills}>
                      {skills
                        .filter((skill) => skill.category === group)
                        .map((skill) => (
                          <li
                            key={skill.id}
                            draggable={!busy}
                            onDragStart={(event) =>
                              event.dataTransfer.setData("application/x-status-skill", skill.id)
                            }
                          >
                            <span className={styles.skillLabel}>
                              <IconAsset
                                icon={skill.icon}
                                name={skill.name}
                                className={styles.skillIcon}
                              />
                              {skill.name}
                            </span>
                            <span className={styles.skillControls}>
                              <button
                                type="button"
                                className={styles.textButton}
                                aria-label={
                                  skill.name +
                                  (featured ? " 일반 스킬로 이동" : " 대표 스킬로 이동")
                                }
                                onClick={() => move(skill.id, !featured)}
                              >
                                {featured ? "일반으로" : "대표로"}
                              </button>
                              <button
                                type="button"
                                className={styles.textButton}
                                aria-label={skill.name + " 선택 해제"}
                                onClick={() => remove(skill)}
                              >
                                ×
                              </button>
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
                {skills.length === 0 && <p className={styles.notice}>선택한 스킬이 없습니다.</p>}
              </section>
            );
          })}
        </div>
        <section className={styles.editorSection} aria-label="스킬 검색 결과">
          <div className={styles.sectionHeader}>
            <h3>스킬 검색</h3>
            <PersonalSkillsManager
              csrf={csrfToken}
              busy={busy}
              changed={(item) => {
                setResults((current) =>
                  current
                    .map((entry) => (entry.id === item.id ? { ...entry, ...item } : entry))
                    .filter((entry) => entry.active),
                );
                change((current) => ({
                  ...current,
                  skills: current.skills.map((skill) =>
                    skill.id === item.id
                      ? { ...skill, name: item.name, category: item.category, icon: item.icon }
                      : skill,
                  ),
                }));
              }}
            />
            <button
              type="button"
              className={styles.button}
              ref={addButton}
              onClick={() => {
                setName(query);
                setCategory("");
                setIcon(automatic);
                setFormError("");
                setCreating(true);
              }}
            >
              개인 스킬 등록
            </button>
          </div>
          <input
            type="search"
            className={styles.input}
            aria-label="스킬 검색"
            maxLength={100}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPageNumber(0);
              setResults([]);
            }}
          />
          {searchError && <p role="alert">{searchError}</p>}
          <ul className={styles.searchResults} aria-busy={loading}>
            {results.map((item) => (
              <li key={item.id}>
                <button type="button" disabled={selected.has(item.id)} onClick={() => select(item)}>
                  <IconAsset icon={item.icon} name={item.name} className={styles.skillIcon} />
                  <span>
                    {item.name}
                    <small>
                      {item.category}
                      {item.personal ? " · 개인" : ""}
                    </small>
                  </span>
                  <span className={styles.notice}>{selected.has(item.id) ? "선택됨" : "+"}</span>
                </button>
              </li>
            ))}
          </ul>
          {loading && <p role="status">검색 중…</p>}
          {!loading && !searchError && results.length === 0 && (
            <p className={styles.notice}>검색 결과가 없습니다.</p>
          )}
          {hasMore && (
            <button
              type="button"
              className={styles.button}
              disabled={loading}
              onClick={() => setPageNumber(pageNumber + 1)}
            >
              더 보기
            </button>
          )}
        </section>
      </fieldset>
      <dialog
        className={styles.editDialog}
        ref={dialog}
        aria-label="개인 스킬 등록"
        onCancel={(event) => {
          if (saving) event.preventDefault();
          else setCreating(false);
        }}
      >
        <form onSubmit={(event) => void create(event)}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>개인 스킬 등록</h2>
            <button
              type="button"
              className={styles.textButton}
              disabled={saving}
              onClick={() => setCreating(false)}
            >
              닫기 ×
            </button>
          </div>
          {formError && (
            <p role="alert" className={styles.error}>
              {formError}
            </p>
          )}
          <fieldset className={styles.fieldset} disabled={saving || busy}>
            <label className={styles.field}>
              스킬명
              <input
                className={styles.input}
                ref={nameInput}
                value={name}
                required
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              카테고리
              <input
                className={styles.input}
                value={category}
                required
                maxLength={60}
                list="skill-categories"
                onChange={(event) => setCategory(event.target.value)}
              />
            </label>
            <datalist id="skill-categories">
              {[
                "언어",
                "웹",
                "프런트엔드",
                "백엔드",
                "데이터베이스",
                "인프라",
                "클라우드",
                "도구",
                "설계",
                "업무",
                "기타",
              ].map((group) => (
                <option value={group} key={group} />
              ))}
            </datalist>
            <IconPicker value={icon} name={name} change={setIcon} disabled={saving || busy} />
            <div className={styles.dialogActions}>
              <button className={styles.button + " " + styles.primary} type="submit">
                {saving ? "등록 중…" : "등록"}
              </button>
            </div>
          </fieldset>
        </form>
      </dialog>
    </section>
  );
}
