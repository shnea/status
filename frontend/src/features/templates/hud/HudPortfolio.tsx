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
import { HudScene } from "./HudScene";
import styles from "./HudPortfolio.module.css";

function ProjectGraphic({ index }: { index: number }) {
  return (
    <svg className={styles.cover} viewBox="0 0 400 260" aria-hidden focusable="false">
      <rect width="400" height="260" fill="#0b1821" />
      <g fill="none" stroke="#365c6d" strokeWidth="1.2">
        {index % 3 === 0 ? (
          <>
            <path d="M-30 250L400 28M-30 180L400 -42M-30 320L400 98M0 76L430 210" />
            <path d="M30 65L180 13L340 103L190 160ZM30 65V182L190 247L340 179V103M190 160V247" />
          </>
        ) : index % 3 === 1 ? (
          <>
            <path d="M110 208L162 34L304 53L251 224Z" />
            <path d="M127 195L173 54L284 69L239 204Z" />
            <path d="M173 54L284 69M164 86L274 102M155 118L264 134M146 151L253 167" />
          </>
        ) : (
          <>
            <circle cx="200" cy="130" r="85" />
            <circle cx="200" cy="130" r="57" />
            <path d="M50 130H350M200 20V240M100 45L300 215M100 215L300 45" />
          </>
        )}
      </g>
      <g fill="#8ed4e2">
        <circle cx="200" cy="130" r="3" />
        <path d="M20 20h18v2H22v16h-2ZM380 240h-18v-2h16v-16h2Z" />
      </g>
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

export function HudPortfolio({
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
        <span aria-hidden>
          {String(sections.findIndex((section) => section.id === "about") + 1).padStart(2, "0")}
        </span>
        자기소개
      </h2>
      <div className={styles.about}>
        {document.profile.imageId && (
          <div className={styles.portraitFrame}>
            <img
              className={styles.portrait}
              src={fileBase + document.profile.imageId + "/content/preview"}
              alt={document.profile.name}
            />
          </div>
        )}
        <RichContent content={document.profile.about} fileBase={fileBase} className={styles.body} />
        {document.profile.contacts.some((link) => link.visible && link.value) && (
          <aside className={styles.contactPanel}>
            <Links links={document.profile.contacts} />
          </aside>
        )}
      </div>
    </section>
  );

  return (
    <main id="content" tabIndex={-1} className={styles.page} data-template="hud">
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
              <div className={styles.heroArt}>
                <HudScene
                  showGlobe={
                    !document.profile.bannerImageId && (hasAbout || !document.profile.imageId)
                  }
                />
                {document.profile.bannerImageId ? (
                  <div className={styles.heroMedia}>
                    <img
                      className={styles.heroBanner}
                      src={fileBase + document.profile.bannerImageId + "/content/preview"}
                      alt={document.profile.name + " 간판 이미지"}
                    />
                  </div>
                ) : !hasAbout && document.profile.imageId ? (
                  <div className={styles.heroMedia}>
                    <img
                      className={styles.heroPortrait}
                      src={fileBase + document.profile.imageId + "/content/preview"}
                      alt={document.profile.name}
                    />
                  </div>
                ) : null}
              </div>
              <div className={styles.heroText}>
                <h1>{document.profile.title || document.profile.name || "이름"}</h1>
                {document.profile.introduction && (
                  <p className={styles.introduction}>{document.profile.introduction}</p>
                )}
                {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
                <Links links={document.profile.contacts} />
                {sections[0] && (
                  <a className={styles.scroll} href={"#" + sections[0].id}>
                    <span className={styles.scrollIcon} aria-hidden>
                      ↓
                    </span>
                    {sectionNames[sections[0].id]}
                  </a>
                )}
              </div>
            </section>

            {sections.map((section, index) =>
              section.id === "about" ? (
                about
              ) : (
                <section key={section.id} className={styles.section} id={section.id}>
                  <h2 className={styles.sectionTitle}>
                    <span aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                    {sectionNames[section.id]}
                  </h2>
                  {section.id === "skills" && <Skills skills={document.skills} />}
                  {section.id === "projects" && (
                    <div className={styles.projects}>
                      {document.projects
                        .filter((project) => project.visible)
                        .map((project, projectIndex) => (
                          <article key={project.id} className={styles.project}>
                            <span className={styles.projectIndex} aria-hidden>
                              {String(projectIndex + 1).padStart(2, "0")}
                            </span>
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
                              <h3>{project.title} ↗</h3>
                              {project.summary && (
                                <p className={styles.summary}>{project.summary}</p>
                              )}
                            </a>
                            <div className={styles.projectSkills}>
                              {document.skills
                                .filter((skill) => project.skillIds.includes(skill.id))
                                .map((skill) => (
                                  <span key={skill.id}>{skill.name}</span>
                                ))}
                            </div>
                            <Links links={project.links} />
                          </article>
                        ))}
                    </div>
                  )}
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
                </section>
              ),
            )}
          </>
        )}
        {aiEnabled && !preview && <AiChat slug={slug} portfolioId={portfolioId} theme="hud" />}
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
