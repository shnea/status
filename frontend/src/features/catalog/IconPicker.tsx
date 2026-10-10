"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { IconRef, SearchPage } from "@/features/portfolio/model";
import { basicIcons, BasicIcon, IconAsset } from "./IconAsset";
import styles from "./IconPicker.module.css";

interface CatalogIcon extends IconRef {
  title: string;
}

const automatic: IconRef = { provider: "initials", key: "", hex: "", monochromeAllowed: true };

export function IconPicker({
  value,
  name,
  change,
  disabled = false,
}: {
  value: IconRef;
  name: string;
  change: (icon: IconRef) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pageNumber, setPageNumber] = useState(0);
  const [items, setItems] = useState<CatalogIcon[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else {
      dialog.current?.close();

      if (wasOpen.current) trigger.current?.focus();
    }

    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoading(true);
    setError("");

    const timer = window.setTimeout(() => {
      void api<SearchPage<CatalogIcon>>(
        "/catalog/icons?q=" + encodeURIComponent(query) + "&page=" + pageNumber,
        { signal: controller.signal },
      )
        .then((result) => {
          if (controller.signal.aborted) return;

          setItems((current) => (pageNumber === 0 ? result.items : [...current, ...result.items]));
          setHasMore(result.hasMore);
        })
        .catch((failure: Error) => {
          if (!controller.signal.aborted) setError(failure.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, pageNumber]);

  function select(icon: IconRef) {
    change(icon);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        ref={trigger}
        disabled={disabled}
        className={styles.trigger}
        aria-label="스킬 아이콘 선택"
        onClick={() => {
          setQuery(name);
          setPageNumber(0);
          setItems([]);
          setOpen(true);
        }}
      >
        <IconAsset icon={value} name={name} className={styles.glyph} />
        아이콘 선택
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label="스킬 아이콘 선택"
        onCancel={() => setOpen(false)}
      >
        <header className={styles.header}>
          <h3>아이콘</h3>
          <button type="button" onClick={() => setOpen(false)}>
            닫기 ×
          </button>
        </header>
        <button
          type="button"
          className={styles.option}
          aria-pressed={value.provider === "initials"}
          onClick={() => select(automatic)}
        >
          <IconAsset icon={automatic} name={name} className={styles.glyph} /> 약자 자동 생성
        </button>
        <h4>기본 아이콘</h4>
        <div className={styles.grid}>
          {Object.entries(basicIcons).map(([key, item]) => (
            <button
              type="button"
              key={key}
              className={styles.option}
              aria-pressed={value.provider === "lucide" && value.key === key}
              onClick={() => select({ provider: "lucide", key, hex: "", monochromeAllowed: true })}
            >
              <BasicIcon name={key} className={styles.glyph} />
              {item.label}
            </button>
          ))}
        </div>
        <h4>브랜드 로고</h4>
        <input
          className={styles.input}
          type="search"
          aria-label="브랜드 로고 검색"
          value={query}
          maxLength={100}
          onChange={(event) => {
            setQuery(event.target.value);
            setPageNumber(0);
            setItems([]);
          }}
        />
        {error && <p role="alert">{error}</p>}
        <div className={styles.results} aria-busy={loading}>
          {items.map((item) => (
            <button
              type="button"
              key={item.provider + ":" + item.key}
              className={styles.option}
              aria-pressed={value.provider === item.provider && value.key === item.key}
              onClick={() =>
                select({
                  provider: item.provider,
                  key: item.key,
                  hex: item.hex,
                  monochromeAllowed: item.monochromeAllowed,
                })
              }
            >
              <IconAsset icon={item} name={item.title} className={styles.glyph} />
              {item.title}
            </button>
          ))}
          {!loading && !error && items.length === 0 && <p>검색 결과가 없습니다.</p>}
        </div>
        {loading && <p role="status">검색 중…</p>}
        {hasMore && (
          <button
            type="button"
            disabled={loading}
            className={styles.option}
            onClick={() => setPageNumber(pageNumber + 1)}
          >
            더 보기
          </button>
        )}
      </dialog>
    </>
  );
}
