"use client";

import type { Contact } from "@/features/portfolio/model";
import { basicIcons, BasicIcon } from "@/features/catalog/IconAsset";
import styles from "./Workspace.module.css";

export function ContactsEditor({
  contacts,
  change,
  disabled = false,
  title = "연락처 · 링크",
}: {
  contacts: Contact[];
  change: (contacts: Contact[]) => void;
  disabled?: boolean;
  title?: string;
}) {
  function update(id: string, changes: Partial<Contact>) {
    change(contacts.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function move(index: number, offset: number) {
    const next = [...contacts];
    const target = index + offset;

    if (target < 0 || target >= next.length) return;

    [next[index], next[target]] = [next[target], next[index]];
    change(next);
  }

  return (
    <section className={styles.editorSection} aria-label={title}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        <button
          type="button"
          className={styles.button}
          disabled={disabled}
          onClick={() =>
            change([
              ...contacts,
              {
                id: crypto.randomUUID(),
                type: "web",
                label: "",
                value: "",
                icon: "link",
                visible: true,
              },
            ])
          }
        >
          추가
        </button>
      </div>
      <fieldset className={styles.fieldset} disabled={disabled}>
        {contacts.map((contact, index) => (
          <fieldset className={styles.contact} key={contact.id}>
            <legend>
              {title} {index + 1}
            </legend>
            <div className={styles.contactFields}>
              <label className={styles.field}>
                유형
                <select
                  className={styles.input}
                  value={contact.type}
                  onChange={(event) => {
                    const type = event.target.value;

                    if (type === "web" || type === "email" || type === "phone")
                      update(contact.id, {
                        type,
                        icon: type === "web" ? "link" : type === "email" ? "mail" : "phone",
                      });
                  }}
                >
                  <option value="web">웹 링크</option>
                  <option value="email">이메일</option>
                  <option value="phone">전화</option>
                </select>
              </label>
              <label className={styles.field}>
                라벨
                <input
                  className={styles.input}
                  value={contact.label}
                  maxLength={100}
                  onChange={(event) => update(contact.id, { label: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                값
                <input
                  className={styles.input}
                  value={contact.value}
                  maxLength={2000}
                  inputMode={
                    contact.type === "email" ? "email" : contact.type === "phone" ? "tel" : "url"
                  }
                  placeholder={contact.type === "web" ? "https://" : undefined}
                  onChange={(event) => update(contact.id, { value: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                아이콘
                <span className={styles.row}>
                  <BasicIcon name={contact.icon} />
                  <select
                    className={styles.input}
                    value={contact.icon}
                    onChange={(event) => update(contact.id, { icon: event.target.value })}
                  >
                    <option value="">없음</option>
                    {Object.entries(basicIcons).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
            <div className={styles.row}>
              <label>
                <input
                  type="checkbox"
                  checked={contact.visible}
                  onChange={(event) => update(contact.id, { visible: event.target.checked })}
                />{" "}
                공개
              </label>
              <button
                type="button"
                className={styles.textButton}
                disabled={index === 0}
                aria-label={title + " " + (index + 1) + " 위로"}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.textButton}
                disabled={index === contacts.length - 1}
                aria-label={title + " " + (index + 1) + " 아래로"}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  if (window.confirm("이 연락처를 삭제할까요?"))
                    change(contacts.filter((item) => item.id !== contact.id));
                }}
              >
                삭제
              </button>
            </div>
          </fieldset>
        ))}
      </fieldset>
    </section>
  );
}
