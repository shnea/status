"use client";

import { useState } from "react";
import type { Contact, Project, Skill } from "@/features/portfolio/model";
import { contactHref, sortedSkills } from "@/features/portfolio/model";
import type { TemplateProps } from "@/features/templates/model";
import { portfolioSections, profileExcerpt, sectionNames } from "@/features/templates/model";
import { useProjectNavigation } from "@/features/templates/useProjectNavigation";
import { BasicIcon, IconAsset } from "@/features/catalog/IconAsset";
import { hasContent, RichContent } from "@/features/content/RichContent";
import { useSiteSettings } from "@/features/site/SiteContext";
import { AiChat } from "@/features/ai/AiChat";
import { ModernProjects } from "./ModernProjects";
import styles from "./ModernFlatPortfolio.module.css";

function HeroGraphic() {
  return (
    <svg className={styles.heroGraphic} viewBox="0 0 640 460" aria-hidden focusable="false">
      <rect x="386" y="26" width="208" height="272" rx="4" fill="#e9f1ff" />
      <path d="M490 26V298M386 162H594" stroke="#fff" strokeWidth="8" />
      <rect
        x="85"
        y="75"
        width="248"
        height="178"
        rx="12"
        fill="#fff"
        stroke="#d5e3fc"
        strokeWidth="2"
      />
      <path d="M85 108H333" stroke="#e4ecfb" strokeWidth="2" />
      <circle cx="105" cy="92" r="4" fill="#3371ef" />
      <circle cx="121" cy="92" r="4" fill="#b7cef8" />
      <circle cx="137" cy="92" r="4" fill="#d8e5fc" />
      <path
        d="M114 137H202M114 158H283M114 179H246M114 200H269"
        stroke="#b7cff8"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M51 371H616" stroke="#d5dfed" strokeWidth="4" />
      <path d="M196 198H442L463 350H176Z" fill="#8ca7d4" />
      <path d="M205 209H431L449 338H187Z" fill="#f1f5ff" />
      <path d="M154 350H485L461 369H180Z" fill="#bdcee8" />
      <path d="M295 350H349L344 357H300Z" fill="#8ca7d4" />
      <path
        d="M301 251L282 270L301 289M339 251L358 270L339 289M330 242L309 298"
        stroke="#3371ef"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M527 329V228M527 275C497 276 481 260 480 239C508 239 526 253 527 275ZM527 251C528 218 548 199 574 198C572 227 554 246 527 251Z"
        fill="#79aa91"
        stroke="#6c9a84"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M499 325H553L546 369H506Z" fill="#cfdcf0" />
      <rect
        x="92"
        y="312"
        width="54"
        height="53"
        rx="8"
        fill="#fff"
        stroke="#d5e3fc"
        strokeWidth="2"
      />
      <path d="M146 323H158V347H146" fill="none" stroke="#d5e3fc" strokeWidth="5" />
      <path d="M111 304V289M125 304V283" stroke="#c2d5f5" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Links({ links }: { links: Contact[] }) {
  return (
    <div className={styles.links}>
      {links
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
  );
}

function SkillBadge({ skill }: { skill: Skill }) {
  return (
    <span className={styles.skill}>
      <IconAsset icon={skill.icon} name={skill.name} className={styles.logo} />
      {skill.name}
    </span>
  );
}

function Skills({ skills }: { skills: Skill[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = sortedSkills(expanded ? skills : skills.filter((skill) => skill.featured));

  return (
    <>
      {[...new Set(shown.map((skill) => skill.category))].map((category) => (
        <div key={category} className={styles.skillGroup}>
          <h3>{category}</h3>
          <div className={styles.skills}>
            {shown
              .filter((skill) => skill.category === category)
              .map((skill) => (
                <SkillBadge key={skill.id} skill={skill} />
              ))}
          </div>
        </div>
      ))}
      {skills.some((skill) => !skill.featured) && (
        <button
          className={styles.more}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "접기 −" : "더보기 +"}
        </button>
      )}
    </>
  );
}

function ProjectDetail({
  project,
  fileBase,
  skills,
  standalone = false,
}: {
  project: Project;
  fileBase: string;
  skills: Skill[];
  standalone?: boolean;
}) {
  const Heading = standalone ? "h1" : "h2";

  return (
    <article className={styles.projectDetail}>
      {project.imageId && (
        <img
          className={styles.detailImage}
          src={fileBase + project.imageId + "/content/preview"}
          alt=""
        />
      )}
      <Heading>{project.title}</Heading>
      {project.role && <p className={styles.meta}>{project.role}</p>}
      {project.summary && <p className={styles.summary}>{project.summary}</p>}
      <div className={styles.skills}>
        {skills
          .filter((skill) => project.skillIds.includes(skill.id))
          .map((skill) => (
            <SkillBadge key={skill.id} skill={skill} />
          ))}
      </div>
      <Links links={project.links} />
      <RichContent content={project.content} fileBase={fileBase} className={styles.body} />
    </article>
  );
}

export function ModernFlatPortfolio({
  document,
  slug,
  portfolioId,
  preview = false,
  sample = false,
  initialProject,
  aiEnabled = false,
}: TemplateProps) {
  const site = useSiteSettings();
  const { selected, modal, close, open } = useProjectNavigation(document.projects, slug, preview);
  const sections = portfolioSections(document);
  const hasAbout = sections.some((section) => section.id === "about");
  const excerpt = hasAbout ? profileExcerpt(document.profile.about) : "";
  const fileBase = preview ? "/api/files/" : "/api/public/files/" + portfolioId + "/";

  const about = hasAbout && (
    <section className={styles.section} key="about" id="about" aria-labelledby="about-heading">
      <h2 className={styles.sectionTitle} id="about-heading">
        자기소개
      </h2>
      <div className={styles.about}>
        <aside className={styles.profileCard} aria-label="프로필">
          {document.profile.imageId && (
            <img
              className={styles.portrait}
              src={fileBase + document.profile.imageId + "/content/preview"}
              alt={document.profile.name}
            />
          )}
          <div className={styles.profileIdentity}>
            <p className={styles.profileName}>{document.profile.name}</p>
            {document.profile.introduction && (
              <p className={styles.profileRole}>{document.profile.introduction}</p>
            )}
          </div>
          <Links links={document.profile.contacts} />
        </aside>
        <RichContent
          content={document.profile.about}
          fileBase={fileBase}
          className={styles.body + " " + styles.aboutBody}
        />
      </div>
    </section>
  );

  return (
    <main id="content" tabIndex={-1} className={styles.page} data-template="modern-flat">
      <div className={styles.container}>
        {preview && (
          <div className={styles.preview}>
            {sample ? "디자인 미리보기 · 예시 데이터" : "비공개 미리보기 · 현재 임시저장본"}
          </div>
        )}
        <header className={styles.header}>
          <a
            className={styles.brand}
            href={sample ? "/design-preview" : preview ? "/dashboard" : "/@" + slug}
            title={sample ? "템플릿 목록으로" : preview ? "작성 화면으로" : undefined}
          >
            {document.profile.name || "포트폴리오"}
          </a>
          {!initialProject && (
            <nav aria-label="포트폴리오 섹션" className={styles.nav}>
              {sections.map((section) => (
                <a key={section.id} href={"#" + section.id}>
                  {sectionNames[section.id]}
                </a>
              ))}
            </nav>
          )}
          <a className={styles.service} href="/">
            {site.serviceName} ↗
          </a>
        </header>
        {initialProject ? (
          <section className={styles.standalone}>
            <a className={styles.more} href={"/@" + slug}>
              ← 포트폴리오
            </a>
            <ProjectDetail
              project={initialProject}
              fileBase={fileBase}
              skills={document.skills}
              standalone
            />
          </section>
        ) : (
          <>
            <section className={styles.hero}>
              <div className={styles.heroText}>
                <h1>{document.profile.title || document.profile.name || "이름"}</h1>
                {document.profile.introduction && (
                  <p className={styles.introduction}>{document.profile.introduction}</p>
                )}
                {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
                <Links links={document.profile.contacts} />
                {sections[0] && (
                  <a className={styles.scroll} href={"#" + sections[0].id}>
                    ↓ {sectionNames[sections[0].id]}
                  </a>
                )}
              </div>
              <div className={styles.heroArt}>
                {document.profile.bannerImageId ? (
                  <img
                    className={styles.heroBanner}
                    src={fileBase + document.profile.bannerImageId + "/content/preview"}
                    alt={document.profile.name + " 간판 이미지"}
                  />
                ) : !hasAbout && document.profile.imageId ? (
                  <img
                    className={styles.heroPortrait}
                    src={fileBase + document.profile.imageId + "/content/preview"}
                    alt={document.profile.name}
                  />
                ) : (
                  <HeroGraphic />
                )}
              </div>
            </section>

            {sections.map((section) => {
              if (section.id === "about") return about;

              if (section.id === "projects") {
                return (
                  <ModernProjects
                    key={section.id}
                    projects={document.projects.filter((project) => project.visible)}
                    skills={document.skills}
                    fileBase={fileBase}
                    slug={slug}
                    open={open}
                  />
                );
              }

              return (
                <section
                  key={section.id}
                  className={styles.section}
                  id={section.id}
                  data-section={section.id}
                  aria-labelledby={section.id + "-heading"}
                >
                  <h2 className={styles.sectionTitle} id={section.id + "-heading"}>
                    {sectionNames[section.id]}
                  </h2>
                  <div className={styles.sectionContent}>
                    {section.id === "skills" && <Skills skills={document.skills} />}
                    {section.id === "history" && (
                      <div className={styles.timeline}>
                        {document.history
                          .filter((item) => item.visible)
                          .map((item) => (
                            <article className={styles.history} key={item.id}>
                              <p className={styles.period}>
                                {item.startMonth} — {item.ongoing ? "진행 중" : item.endMonth}
                              </p>
                              <div>
                                <h3>{item.title}</h3>
                                <p className={styles.meta}>
                                  {[item.organization, item.role].filter(Boolean).join(" / ")}
                                </p>
                              </div>
                              <div>
                                {item.summary && <p className={styles.summary}>{item.summary}</p>}
                                {hasContent(item.content) && (
                                  <details>
                                    <summary>자세히 +</summary>
                                    <RichContent
                                      content={item.content}
                                      fileBase={fileBase}
                                      className={styles.body}
                                    />
                                  </details>
                                )}
                              </div>
                            </article>
                          ))}
                      </div>
                    )}
                    {section.id === "certifications" && (
                      <div className={styles.certifications}>
                        {document.certifications
                          .filter((item) => item.visible)
                          .map((item) => (
                            <article className={styles.certification} key={item.id}>
                              <BasicIcon name="shield" className={styles.certIcon} />
                              <div>
                                <h3>{item.name}</h3>
                                <p className={styles.meta}>{item.issuer}</p>
                                <p className={styles.period}>
                                  {item.issuedOn}
                                  {item.expiresOn && " — " + item.expiresOn}
                                  {item.expiresOn &&
                                    item.expiresOn < new Date().toISOString().slice(0, 10) &&
                                    " · 만료"}
                                </p>
                                {item.credentialIdVisible && item.credentialId && (
                                  <p className={styles.meta}>{item.credentialId}</p>
                                )}
                                {item.url && (
                                  <a
                                    className={styles.more}
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    자격 확인 ↗
                                  </a>
                                )}
                              </div>
                            </article>
                          ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </>
        )}
        {aiEnabled && !preview && (
          <AiChat slug={slug} portfolioId={portfolioId} theme="modern-flat" />
        )}
        <footer className={styles.footer}>
          <span>{document.profile.name}</span>
          <a href="/">{site.serviceName}</a>
        </footer>
      </div>
      <dialog
        ref={modal}
        className={styles.dialog}
        aria-label="프로젝트 상세"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <button className={styles.close} onClick={close}>
          닫기 ×
        </button>
        {selected && (
          <ProjectDetail project={selected} fileBase={fileBase} skills={document.skills} />
        )}
      </dialog>
    </main>
  );
}
