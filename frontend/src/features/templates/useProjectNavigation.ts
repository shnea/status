"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Project } from "@/features/portfolio/model";

export function useProjectNavigation(projects: Project[], slug: string, preview: boolean) {
  const [selected, setSelected] = useState<Project | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (preview) return;

    const onPopState = () => {
      const id = window.location.pathname.split("/projects/")[1];
      setSelected(projects.find((project) => project.visible && project.id === id) || null);
    };

    window.addEventListener("popstate", onPopState);

    return () => window.removeEventListener("popstate", onPopState);
  }, [projects, preview]);

  useEffect(() => {
    const body = window.document.body;
    const overflow = body.style.overflow;
    const panel = modal.current;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }

    if (selected) {
      body.style.overflow = "hidden";
      panel?.showModal();
      panel?.addEventListener("keydown", closeOnEscape);
    } else {
      panel?.close();
      previousFocus.current?.focus({ preventScroll: true });
    }

    return () => {
      panel?.removeEventListener("keydown", closeOnEscape);
      body.style.overflow = overflow;
    };
  }, [selected, preview]);

  function close() {
    if (preview) setSelected(null);
    else window.history.back();
  }

  function open(event: MouseEvent<HTMLAnchorElement>, project: Project) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;

    event.preventDefault();
    previousFocus.current = event.currentTarget;
    setSelected(project);

    if (!preview) window.history.pushState(null, "", "/@" + slug + "/projects/" + project.id);
  }

  return { selected, modal, close, open };
}
