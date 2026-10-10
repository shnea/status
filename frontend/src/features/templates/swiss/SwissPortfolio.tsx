"use client";

import { Fragment, useState } from "react";
import type { Contact, Project, Skill } from "@/features/portfolio/model";
import { contactHref, sortedSkills } from "@/features/portfolio/model";
import type { TemplateProps } from "@/features/templates/model";
import { useProjectNavigation } from "@/features/templates/useProjectNavigation";
import { portfolioSections, profileExcerpt, sectionNames } from "@/features/templates/model";
import { BasicIcon, IconAsset } from "@/features/catalog/IconAsset";
import { hasContent, RichContent } from "@/features/content/RichContent";
import { useSiteSettings } from "@/features/site/SiteContext";
import { AiChat } from "@/features/ai/AiChat";
import styles from "./SwissPortfolio.module.css";

function ProjectGraphic({ variant }: { variant: number }) {
  return (
    <svg className={styles.projectGraphic} viewBox="0 0 400 300" aria-hidden focusable="false">
      {variant === 0 ? (
        <>
          <rect width="400" height="300" fill="#e4e3dd" />
          <path d="M0 300V164C0 73 74 0 164 0H400V300Z" fill="#191919" />
          <path d="M0 212C95 102 178 200 400 22V124C179 278 106 190 0 300Z" fill="#fbfbf8" />
        </>
      ) : variant === 1 ? (
        <>
          <rect width="400" height="300" fill="#20211f" />
          <path d="M108 236L200 47L292 236Z" fill="none" stroke="#d8d7d0" strokeWidth="2" />
          <path d="M151 236L221 91L270 236Z" fill="#fbfbf8" />
          <circle cx="200" cy="47" r="5" fill="#b34224" />
        </>
      ) : (
        <>
          <rect width="400" height="300" fill="#eeede7" />
          <circle cx="147" cy="150" r="109" fill="#191919" />
          <circle cx="253" cy="150" r="109" fill="#b34224" />
          <path d="M200 55A109 109 0 0 1 200 245A109 109 0 0 1 200 55Z" fill="#fbfbf8" />
        </>
      )}
    </svg>
  );
}

function Links({ links }: { links: Contact[] }) {
  return (
    <div className={styles.contacts}>
      {links
        .filter((link) => link.visible && link.value)
        .map((link) => (
          <a
            key={link.id}
            className={styles.chip}
            href={contactHref(link)}
            target={link.type === "web" ? "_blank" : undefined}
            rel="noopener noreferrer"
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
  const visible = sortedSkills(expanded ? skills : skills.filter((skill) => skill.featured));
  const categories = [...new Set(visible.map((skill) => skill.category))];

  return (
    <div>
      {categories.map((category) => (
        <div key={category} className={styles.skillGroup}>
          <h3 className={styles.skillCategory}>{category}</h3>
          <div className={styles.skills}>
            {visible
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
    </div>
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
          className={styles.projectImage}
          src={fileBase + project.imageId + "/content/preview"}
          alt=""
        />
      )}
      <Heading className={styles.projectTitle}>{project.title}</Heading>
      {project.role && <p className={styles.meta}>{project.role}</p>}
      {project.summary && <p className={styles.summary}>{project.summary}</p>}
      {project.skillIds.length > 0 && (
        <div className={styles.skills}>
          {skills
            .filter((skill) => project.skillIds.includes(skill.id))
            .map((skill) => (
              <SkillBadge key={skill.id} skill={skill} />
            ))}
        </div>
      )}
      <Links links={project.links} />
      <RichContent content={project.content} fileBase={fileBase} className={styles.body} />
    </article>
  );
}

export function SwissPortfolio({
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

  const fileBase = preview ? "/api/files/" : "/api/public/files/" + portfolioId + "/";

  const fileUrl = (id: string, variant: string) =>
    preview
      ? "/api/files/" + id + "/content/" + variant
      : "/api/public/files/" + portfolioId + "/" + id + "/content/" + variant;

  const names = sectionNames;
  const visibleSections = portfolioSections(document);
  const excerpt = profileExcerpt(document.profile.about);

  const hasAbout = hasContent(document.profile.about);
  const hasProjects = visibleSections.some((section) => section.id === "projects");

  const portrait = document.profile.imageId ? (
    <img
      className={styles.portrait}
      src={fileUrl(document.profile.imageId, "preview")}
      alt={document.profile.name}
    />
  ) : null;

  const about = hasAbout && (
    <section className={styles.about} id="about" aria-labelledby="about-heading">
      <h2 className={styles.sectionHeading} id="about-heading">
        자기소개
      </h2>
      <div className={document.profile.imageId ? styles.aboutContent : styles.aboutText}>
        {portrait}
        <RichContent content={document.profile.about} fileBase={fileBase} className={styles.body} />
      </div>
    </section>
  );

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      {preview && (
        <div className={styles.preview}>
          {sample ? "디자인 미리보기 · 예시 데이터" : "비공개 미리보기 · 현재 임시저장본"}
        </div>
      )}
      <header className={styles.header}>
        <a
          className={styles.brand}
          href={sample ? "/design-preview" : preview ? "/dashboard" : "/@" + slug}
        >
          {sample
            ? "템플릿 목록으로 ↗"
            : preview
              ? "작성 화면으로 ↗"
              : document.profile.name || "포트폴리오"}
        </a>
        {!initialProject && (
          <nav className={styles.sectionNav} aria-label="포트폴리오 섹션">
            {hasContent(document.profile.about) && <a href="#about">자기소개</a>}
            {visibleSections.map((section) => (
              <a key={section.id} href={"#" + section.id}>
                {names[section.id]}
              </a>
            ))}
          </nav>
        )}
        <a className={styles.serviceLink} href="/">
          {site.serviceName} ↗
        </a>
      </header>
      {initialProject ? (
        <section style={{ padding: "48px 0" }}>
          <a href={"/@" + slug}>← 포트폴리오</a>
          <ProjectDetail
            project={initialProject}
            fileBase={fileBase}
            skills={document.skills}
            standalone
          />
        </section>
      ) : (
        <>
          <section className={styles.profile}>
            <div className={styles.profileHeading}>
              <h1 className={styles.name}>
                {document.profile.title || document.profile.name || "이름"}
              </h1>
            </div>
            <div className={styles.profileAside}>
              {!hasAbout && portrait}
              {excerpt && <p className={styles.heroExcerpt}>{excerpt}</p>}
              {document.profile.introduction && (
                <p className={styles.introduction}>{document.profile.introduction}</p>
              )}
              <Links links={document.profile.contacts} />
              {hasAbout && (
                <a className={styles.aboutLink} href="#about">
                  자기소개 ↓
                </a>
              )}
            </div>
          </section>
          {!hasProjects && about}
          {visibleSections.map((section, index) => (
            <Fragment key={section.id}>
              <section
                className={section.id === "projects" ? styles.projectSection : styles.section}
                id={section.id}
              >
                <h2 className={styles.sectionHeading}>
                  <span className={styles.index}>0{index + 1}</span>
                  {names[section.id]}
                </h2>
                <div className={section.id === "projects" ? styles.projectGrid : undefined}>
                  {section.id === "skills" && <Skills skills={document.skills} />}
                  {section.id === "projects" &&
                    document.projects
                      .filter((project) => project.visible)
                      .map((project, projectIndex) => (
                        <article key={project.id} className={styles.project}>
                          <a
                            className={styles.projectLink}
                            href={"/@" + slug + "/projects/" + project.id}
                            onClick={(event) => open(event, project)}
                          >
                            <div className={styles.projectCover}>
                              {project.imageId ? (
                                <img
                                  className={styles.projectImage}
                                  src={fileUrl(project.imageId, "preview")}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <ProjectGraphic variant={projectIndex % 3} />
                              )}
                            </div>
                            <h3 className={styles.projectTitle}>{project.title} ↗</h3>
                            {project.summary && <p className={styles.summary}>{project.summary}</p>}
                          </a>
                          <Links links={project.links} />
                        </article>
                      ))}
                  {section.id === "history" &&
                    document.history
                      .filter((item) => item.visible)
                      .map((item) => (
                        <article key={item.id} className={styles.history}>
                          <div className={styles.period}>
                            {item.startMonth} — {item.ongoing ? "진행 중" : item.endMonth}
                          </div>
                          <div>
                            <h3 className={styles.historyTitle}>{item.title}</h3>
                            <p className={styles.organization}>
                              {item.organization}
                              {item.role && " / " + item.role}
                            </p>
                            <p className={styles.summary}>{item.summary}</p>
                            {hasContent(item.content) && (
                              <details className={styles.details}>
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
                  {section.id === "certifications" &&
                    document.certifications
                      .filter((cert) => cert.visible)
                      .map((cert) => (
                        <article key={cert.id} className={styles.certification}>
                          <div className={styles.period}>
                            {cert.issuedOn}
                            {cert.expiresOn && " — " + cert.expiresOn}
                            {cert.expiresOn &&
                              cert.expiresOn < new Date().toISOString().slice(0, 10) &&
                              " · 만료"}
                          </div>
                          <div>
                            <h3>{cert.name}</h3>
                            <p className={styles.organization}>{cert.issuer}</p>
                            {cert.credentialIdVisible && cert.credentialId && (
                              <p className={styles.meta}>{cert.credentialId}</p>
                            )}
                            {cert.url && (
                              <a
                                className={styles.more}
                                href={cert.url}
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
              </section>
              {section.id === "projects" && about}
            </Fragment>
          ))}
        </>
      )}
      {aiEnabled && !preview && <AiChat slug={slug} portfolioId={portfolioId} theme="swiss" />}
      <footer className={styles.footer}>
        <span>{document.profile.name}</span>
        <a href="/">{site.serviceName}</a>
      </footer>
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
