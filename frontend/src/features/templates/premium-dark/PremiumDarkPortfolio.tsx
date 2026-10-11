"use client";

import { useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { Contact, Project, Skill } from "@/features/portfolio/model";
import { contactHref, initials, sortedSkills } from "@/features/portfolio/model";
import type { TemplateProps } from "@/features/templates/model";
import { portfolioSections, profileExcerpt, sectionNames } from "@/features/templates/model";
import { useProjectNavigation } from "@/features/templates/useProjectNavigation";
import { BasicIcon, IconAsset } from "@/features/catalog/IconAsset";
import { hasContent, RichContent } from "@/features/content/RichContent";
import { useSiteSettings } from "@/features/site/SiteContext";
import { AiChat } from "@/features/ai/AiChat";
import styles from "./PremiumDarkPortfolio.module.css";

function textLength(node: JSONContent): number {
  let length = node.text?.length || 0;

  for (const child of node.content || []) {
    length += textLength(child);
  }

  return length;
}

function HeroGraphic() {
  return (
    <svg className={styles.heroGraphic} viewBox="0 0 600 480" aria-hidden focusable="false">
      <rect x="134" y="41" width="355" height="395" rx="178" fill="#181b1f" />
      <path d="M201 436V219C201 99 370 66 451 178" fill="none" stroke="#373b40" strokeWidth="42" />
      <path d="M239 436V223C239 143 354 118 415 179" fill="none" stroke="#b7b9bb" strokeWidth="3" />
      <path d="M312 436V40M134 274H490" stroke="#2b2e32" />
      <path d="M108 436H514" stroke="#50545a" />
    </svg>
  );
}

function ProjectGraphic({ index }: { index: number }) {
  return (
    <svg className={styles.cover} viewBox="0 0 400 260" aria-hidden focusable="false">
      <rect width="400" height="260" fill="#16191c" />
      {index % 3 === 0 ? (
        <>
          <path d="M-60 227C88 21 219 265 460 66V260H-60Z" fill="#8d9398" />
          <path d="M-40 260C109 62 250 269 433 121" stroke="#d6d8da" fill="none" strokeWidth="2" />
        </>
      ) : index % 3 === 1 ? (
        <>
          <path d="M84 228L192 29L316 103L208 260Z" fill="#252b30" stroke="#777d82" />
          <path d="M192 29L208 260M84 228L316 103" stroke="#555d64" />
          <circle cx="201" cy="145" r="28" fill="#0e1114" stroke="#91969a" />
        </>
      ) : (
        <>
          <path d="M0 207L223 0L400 154V260H0Z" fill="#4c5257" />
          <path d="M0 142L187 0H251L34 207Z" fill="#b2b5b7" />
          <path d="M48 260L307 72M0 232L274 45M107 260L340 105" stroke="#282d31" />
        </>
      )}
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

export function PremiumDarkPortfolio({
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

  const compact = sections.map((section) => {
    switch (section.id) {
      case "about": {
        const content = document.profile.about?.content;
        const blocks = content?.content || [];

        return Boolean(
          content &&
          blocks.length <= 3 &&
          blocks.every((block) => block.type === "paragraph") &&
          textLength(content) <= 380 &&
          document.profile.contacts.filter((link) => link.visible && link.value).length <= 4,
        );
      }

      case "skills":
        return document.skills.length <= 12;
      case "history": {
        const entries = document.history.filter((item) => item.visible);

        return (
          entries.length <= 3 &&
          entries.every(
            (item) =>
              item.summary.length <= 160 &&
              item.title.length <= 80 &&
              item.organization.length + item.role.length <= 100,
          )
        );
      }

      case "certifications":
        return document.certifications.filter((item) => item.visible).length <= 2;
      case "projects":
        return false;
    }
  });

  const paired = new Set<string>();

  // Pair only adjacent compact sections: no reordering or stranded half-width panels.
  for (let index = 0; index < sections.length - 1; index++) {
    if (compact[index] && compact[index + 1]) {
      paired.add(sections[index].id);
      paired.add(sections[index + 1].id);
      index++;
    }
  }

  const about = hasAbout && (
    <section
      className={styles.aboutSection}
      key="about"
      id="about"
      aria-labelledby="about-heading"
      data-layout={paired.has("about") ? "paired" : "full"}
    >
      <h2 className={styles.sectionTitle} id="about-heading">
        <span aria-hidden>
          {String(sections.findIndex((section) => section.id === "about") + 1).padStart(2, "0")}
        </span>
        자기소개
      </h2>
      <div className={styles.about}>
        <div className={styles.aboutProfile}>
          {document.profile.imageId && (
            <img
              className={styles.portrait}
              src={fileBase + document.profile.imageId + "/content/preview"}
              alt={document.profile.name}
            />
          )}
          <p className={styles.profileName}>{document.profile.name}</p>
          {document.profile.introduction && (
            <p className={styles.profileRole}>{document.profile.introduction}</p>
          )}
        </div>
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
    <main id="content" tabIndex={-1} className={styles.page} data-template="premium-dark">
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
          >
            <span aria-hidden>{initials(document.profile.name)}</span>
            {sample
              ? "템플릿 목록으로 ↗"
              : preview
                ? "작성 화면으로 ↗"
                : document.profile.name || "포트폴리오"}
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
                ) : document.profile.imageId ? (
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
            <div className={styles.sections}>
              {sections.map((section, index) =>
                section.id === "about" ? (
                  about
                ) : (
                  <section
                    key={section.id}
                    className={styles.section}
                    id={section.id}
                    data-section={section.id}
                    data-layout={paired.has(section.id) ? "paired" : "full"}
                    aria-labelledby={section.id + "-heading"}
                  >
                    <h2 className={styles.sectionTitle} id={section.id + "-heading"}>
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
            </div>
          </>
        )}
        {aiEnabled && !preview && (
          <AiChat slug={slug} portfolioId={portfolioId} theme="premium-dark" />
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
