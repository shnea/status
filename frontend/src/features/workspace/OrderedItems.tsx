"use client";

import { GripVertical } from "lucide-react";
import styles from "./Workspace.module.css";

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;

  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);

  return result;
}

export function OrderedItems({
  items,
  disabled,
  edit,
  remove,
  visibility,
  move,
}: {
  items: { id: string; title: string; summary?: string; visible: boolean }[];
  disabled: boolean;
  edit?: (id: string) => void;
  remove?: (id: string) => void;
  visibility: (id: string, visible: boolean) => void;
  move: (from: number, to: number) => void;
}) {
  return (
    <ol className={styles.orderedItems}>
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable={!disabled}
          onDragStart={(event) => event.dataTransfer.setData("application/x-status-item", item.id)}
          onDragOver={(event) => {
            if (!disabled) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();

            const source = items.findIndex(
              (entry) => entry.id === event.dataTransfer.getData("application/x-status-item"),
            );

            if (!disabled && source >= 0) move(source, index);
          }}
        >
          <div className={styles.itemHeading}>
            <GripVertical aria-hidden size={18} />
            <div>
              <h3>{item.title || "제목 없음"}</h3>
              {item.summary && <p>{item.summary}</p>}
            </div>
            {!item.visible && <span className={styles.notice}>숨김</span>}
          </div>
          <div className={styles.itemActions}>
            <label>
              <input
                type="checkbox"
                disabled={disabled}
                checked={item.visible}
                onChange={(event) => visibility(item.id, event.target.checked)}
              />{" "}
              표시
            </label>
            <button
              type="button"
              className={styles.textButton}
              disabled={disabled || index === 0}
              aria-label={(item.title || "제목 없음") + " 위로"}
              onClick={() => move(index, index - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.textButton}
              disabled={disabled || index === items.length - 1}
              aria-label={(item.title || "제목 없음") + " 아래로"}
              onClick={() => move(index, index + 1)}
            >
              ↓
            </button>
            {edit && (
              <button
                type="button"
                className={styles.textButton}
                disabled={disabled}
                aria-label={(item.title || "제목 없음") + " 수정"}
                onClick={() => edit(item.id)}
              >
                수정
              </button>
            )}
            {remove && (
              <button
                type="button"
                className={styles.textButton}
                disabled={disabled}
                aria-label={(item.title || "제목 없음") + " 삭제"}
                onClick={() => remove(item.id)}
              >
                삭제
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
