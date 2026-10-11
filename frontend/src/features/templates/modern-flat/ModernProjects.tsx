"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Project, Skill } from "@/features/portfolio/model";
import { contactHref } from "@/features/portfolio/model";
import { BasicIcon } from "@/features/catalog/IconAsset";
import styles from "./ModernFlatPortfolio.module.css";

function ProjectGraphic({ index }: { index: number }) {
  return (
    <svg className={styles.cover} viewBox="0 0 400 260" aria-hidden focusable="false">
      <rect width="400" height="260" rx="14" fill={["#edf4ff", "#e9f6ef", "#fff6e5"][index % 3]} />
      {index % 3 === 0 ? (
        <>
          <rect
            x="62"
            y="51"
            width="276"
            height="159"
            rx="12"
            fill="#fff"
            stroke="#c6dcff"
            strokeWidth="2"
          />
          <path d="M62 84H338" stroke="#e2edff" />
          <circle cx="83" cy="68" r="4" fill="#70a3f6" />
          <rect x="85" y="106" width="76" height="78" rx="6" fill="#e5efff" />
          <path
            d="M174 119H310M174 140H281M174 164H295"
            stroke="#bfd5f7"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </>
      ) : index % 3 === 1 ? (
        <>
          <circle cx="200" cy="130" r="88" fill="#d7efdf" />
          <path
            d="M200 58L251 80V137C251 173 224 193 200 207C176 193 149 173 149 137V80Z"
            fill="#67ae87"
          />
          <path
            d="M176 130L193 149L227 111"
            fill="none"
            stroke="#fff"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <rect
            x="76"
            y="54"
            width="222"
            height="154"
            rx="12"
            fill="#fff"
            stroke="#eadfc6"
            strokeWidth="2"
          />
          <path
            d="M102 86H225M102 115H199M102 144H242M102 173H167"
            stroke="#d4deef"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle cx="286" cy="137" r="39" fill="#f7fbff" stroke="#6c9ce9" strokeWidth="8" />
          <path d="M314 166L342 194" stroke="#6c9ce9" strokeWidth="12" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function ModernProjects({
  projects,
  skills,
  fileBase,
  slug,
  open,
}: {
  projects: Project[];
  skills: Skill[];
  fileBase: string;
  slug: string;
  open: (event: MouseEvent<HTMLAnchorElement>, project: Project) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState(false);
  const [position, setPosition] = useState({ first: 0, count: 1 });

  useEffect(() => {
    const list = rail.current;

    if (!list || all) return;

    function updatePosition() {
      if (!list) return;

      const cards = list.querySelectorAll("article");
      const first = cards[0];
      const second = cards[1];

      if (!first) return;

      const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
      const gap = step - first.offsetWidth;

      // The rail has 4px padding on each side to keep keyboard focus rings visible.
      const count = Math.max(
        1,
        Math.min(projects.length, Math.floor((list.clientWidth - 8 + gap + 1) / step)),
      );

      const index = Math.min(
        projects.length - count,
        Math.max(0, Math.round(list.scrollLeft / step)),
      );

      setPosition((current) =>
        current.first === index && current.count === count ? current : { first: index, count },
      );
    }

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(list);
    list.addEventListener("scroll", updatePosition, { passive: true });

    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", updatePosition);
    };
  }, [all, projects.length]);

  function move(direction: number) {
    const list = rail.current;

    if (!list) return;

    const cards = list.querySelectorAll("article");
    const first = cards[0];
    const second = cards[1];

    if (!first || !second) return;

    const step = second.offsetLeft - first.offsetLeft;

    const index = Math.max(
      0,
      Math.min(projects.length - position.count, position.first + direction),
    );

    list.scrollTo({
      left: step * index,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  const last = Math.min(projects.length, position.first + position.count);
  const range = position.count === 1 ? String(position.first + 1) : position.first + 1 + "–" + last;

  return (
    <section
      className={styles.section}
      id="projects"
      data-section="projects"
      aria-labelledby="projects-heading"
    >
      <div className={styles.projectsHeader}>
        <h2 className={styles.sectionTitle} id="projects-heading">
          프로젝트
        </h2>
        <div className={styles.projectControls}>
          <span className={styles.projectPosition} role="status" aria-label="프로젝트 표시 범위">
            {all ? "전체 " + projects.length + "개" : range + " / " + projects.length}
          </span>
          {projects.length > 1 && (
            <button
              className={styles.viewToggle}
              aria-expanded={all}
              aria-controls="modern-project-list"
              onClick={() => setAll(!all)}
            >
              {all ? "가로 보기" : "전체 보기"}
            </button>
          )}
          {!all && (
            <div className={styles.projectArrows}>
              <button
                className={styles.arrowButton}
                aria-label="이전 프로젝트"
                aria-controls="modern-project-list"
                disabled={position.first === 0}
                onClick={() => move(-1)}
              >
                <span aria-hidden>←</span>
              </button>
              <button
                className={styles.arrowButton}
                aria-label="다음 프로젝트"
                aria-controls="modern-project-list"
                disabled={last >= projects.length}
                onClick={() => move(1)}
              >
                <span aria-hidden>→</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={rail}
        id="modern-project-list"
        className={all ? styles.projectsGrid : styles.projectsRail}
        role="region"
        aria-label="프로젝트 목록"
        tabIndex={all ? undefined : 0}
      >
        {projects.map((project, projectIndex) => (
          <article key={project.id} className={styles.project}>
            <a
              className={styles.projectLink}
              href={"/@" + slug + "/projects/" + project.id}
              onClick={(event) => open(event, project)}
            >
              <div className={styles.coverFrame}>
                {project.imageId ? (
                  <img
                    className={styles.cover}
                    src={fileBase + project.imageId + "/content/preview"}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <ProjectGraphic index={projectIndex} />
                )}
              </div>
              <div className={styles.projectHeading}>
                <h3>{project.title}</h3>
                <span className={styles.projectArrow} aria-hidden>
                  ↗
                </span>
              </div>
              {project.summary && <p className={styles.summary}>{project.summary}</p>}
            </a>
            <div className={styles.projectSkills}>
              {skills
                .filter((skill) => project.skillIds.includes(skill.id))
                .map((skill) => (
                  <span key={skill.id}>{skill.name}</span>
                ))}
            </div>
            <div className={styles.links}>
              {project.links
                .filter((link) => link.visible && link.value)
                .map((link) => (
                  <a
                    key={link.id}
                    href={contactHref(link)}
                    target={link.type === "web" ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className={styles.chip}
                  >
                    <BasicIcon name={link.icon} />
                    {link.label || link.value} ↗
                  </a>
                ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
