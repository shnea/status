"use client";

import type { AttachmentAdapter } from "@shnea/editor";

import { useState } from "react";
import type { PortfolioDocument, Project } from "@/features/portfolio/model";
import { sortedSkills } from "@/features/portfolio/model";
import { OrderedItems, moveItem } from "./OrderedItems";
import { EditDialog } from "./EditDialog";
import { DocumentEditor } from "./DocumentEditor";
import { ImageInput } from "@/features/files/ImageInput";
import { ContactsEditor } from "./ContactsEditor";
import styles from "./Workspace.module.css";

export function ProjectsEditor({
  document,
  busy,
  change,
  onError,
  attachments,
  filesPending,
}: {
  attachments: AttachmentAdapter;
  filesPending: boolean;
  document: PortfolioDocument;
  busy: boolean;
  change: (update: (current: PortfolioDocument) => PortfolioDocument) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const project = document.projects.find((item) => item.id === editing);

  function update(id: string, changes: Partial<Project>) {
    change((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
  }

  function add() {
    const id = crypto.randomUUID();
    change((current) => ({
      ...current,
      projects: [
        ...current.projects,
        {
          id,
          title: "",
          role: "",
          summary: "",
          imageId: null,
          skillIds: [],
          links: [],
          content: null,
          visible: true,
        },
      ],
    }));
    setEditing(id);
  }

  return (
    <section aria-label="프로젝트 편집">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>프로젝트</h2>
        <button type="button" className={styles.button} disabled={busy} onClick={add}>
          프로젝트 추가
        </button>
      </div>
      <OrderedItems
        items={document.projects}
        disabled={busy}
        edit={setEditing}
        visibility={(id, visible) => update(id, { visible })}
        move={(from, to) =>
          change((current) => ({ ...current, projects: moveItem(current.projects, from, to) }))
        }
        remove={(id) => {
          if (window.confirm("이 프로젝트를 삭제할까요?"))
            change((current) => ({
              ...current,
              projects: current.projects.filter((item) => item.id !== id),
            }));
        }}
      />
      <EditDialog
        open={Boolean(project)}
        title="프로젝트 수정"
        busy={busy || filesPending}
        close={() => setEditing(null)}
      >
        {project && (
          <>
            <fieldset disabled={busy} className={styles.fieldset}>
              <label className={styles.field}>
                프로젝트명
                <input
                  className={styles.input}
                  value={project.title}
                  maxLength={200}
                  onChange={(event) => update(project.id, { title: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                역할
                <input
                  className={styles.input}
                  value={project.role}
                  maxLength={200}
                  onChange={(event) => update(project.id, { role: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                요약
                <textarea
                  className={styles.input}
                  rows={3}
                  value={project.summary}
                  maxLength={1000}
                  onChange={(event) => update(project.id, { summary: event.target.value })}
                />
              </label>
              <ImageInput
                value={project.imageId}
                label="대표 이미지"
                adapter={attachments}
                disabled={busy}
                change={(imageId) => update(project.id, { imageId })}
              />
              <fieldset className={styles.skillSelection}>
                <legend>사용 스킬</legend>
                {sortedSkills(document.skills).map((skill) => (
                  <label key={skill.id}>
                    <input
                      type="checkbox"
                      checked={project.skillIds.includes(skill.id)}
                      onChange={(event) =>
                        update(project.id, {
                          skillIds: event.target.checked
                            ? [...project.skillIds, skill.id]
                            : project.skillIds.filter((id) => id !== skill.id),
                        })
                      }
                    />
                    {skill.name}
                  </label>
                ))}
              </fieldset>
            </fieldset>
            <ContactsEditor
              contacts={project.links}
              title="외부 링크"
              disabled={busy}
              change={(links) => update(project.id, { links })}
            />
            <h3 className={styles.fieldTitle}>내용</h3>
            <DocumentEditor
              value={project.content}
              documentKey={project.id}
              label="프로젝트 내용"
              busy={busy}
              change={(content) => update(project.id, { content })}
              onError={onError}
              attachments={attachments}
            />
          </>
        )}
      </EditDialog>
    </section>
  );
}
