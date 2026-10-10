"use client";

import { useState } from "react";
import type { Contact, Project, Skill } from "@/features/portfolio/model";
import { contactHref, initials, sortedSkills } from "@/features/portfolio/model";
import type { TemplateProps } from "@/features/templates/model";
import { portfolioSections, profileExcerpt, sectionNames } from "@/features/templates/model";
import { useProjectNavigation } from "@/features/templates/useProjectNavigation";
import { BasicIcon, IconAsset } from "@/features/catalog/IconAsset";
import { hasContent, RichContent } from "@/features/content/RichContent";
import { useSiteSettings } from "@/features/site/SiteContext";
import { AiChat } from "@/features/ai/AiChat";
import styles from "./GoogleFlatPortfolio.module.css";

function HeroGraphic() {
  return (
    <svg className={styles.heroGraphic} viewBox="0 0 600 420" aria-hidden focusable="false">
      <circle cx="320" cy="218" r="164" fill="#e7f0ff" />
      <circle cx="90" cy="300" r="47" fill="#e7f5ee" />
      <circle cx="493" cy="60" r="30" fill="#fff0cf" />
      <rect
        x="115"
        y="104"
        width="306"
        height="215"
        rx="18"
        fill="#fff"
        stroke="#d7e4f6"
        strokeWidth="2"
      />
      <path d="M115 143H421" stroke="#e3eaf4" strokeWidth="2" />
      <circle cx="138" cy="124" r="4" fill="#ea7068" />
      <circle cx="153" cy="124" r="4" fill="#edc15c" />
      <circle cx="168" cy="124" r="4" fill="#69b78d" />
      <path
        d="M150 180L131 201L150 222M184 180L203 201L184 222M174 170L160 232"
        fill="none"
        stroke="#4285f4"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="228" y="174" width="147" height="8" rx="4" fill="#c2d8fc" />
      <rect x="228" y="194" width="106" height="8" rx="4" fill="#e3ecfa" />
      <rect x="143" y="257" width="232" height="30" rx="8" fill="#f3f7fd" />
      <rect
        x="376"
        y="231"
        width="123"
        height="106"
        rx="16"
        fill="#fff"
        stroke="#d7e4f6"
        strokeWidth="2"
      />
      <ellipse cx="437" cy="258" rx="39" ry="12" fill="#85b2fc" />
      <path
        d="M398 258V300C398 316 476 316 476 300V258"
        fill="#e8f0ff"
        stroke="#85b2fc"
        strokeWidth="2"
      />
      <path d="M398 279C398 295 476 295 476 279" fill="none" stroke="#85b2fc" strokeWidth="2" />
      <path
        d="M455 355V275M455 325C496 310 507 292 514 264C472 274 455 295 455 325M455 345C419 335 412 316 410 295C442 305 454 324 455 345"
        fill="#71b695"
        stroke="#4c9977"
        strokeWidth="2"
      />
      <path d="M430 351H480L474 388H436Z" fill="#e4eaf2" />
      <path d="M95 389H526" stroke="#ccd7e7" strokeWidth="2" />
    </svg>
  );
}

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

export function GoogleFlatPortfolio({
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
        <span aria-hidden className={styles.aboutMarker} />
        자기소개
      </h2>
      <div className={styles.about}>
        {document.profile.imageId && (
          <img
            className={styles.portrait}
            src={fileBase + document.profile.imageId + "/content/preview"}
            alt={document.profile.name}
          />
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
    <main id="content" tabIndex={-1} className={styles.page} data-template="google-flat">
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

            {sections.map((section) =>
              section.id === "about" ? (
                about
              ) : (
                <section
                  key={section.id}
                  className={styles.section}
                  id={section.id}
                  data-section={section.id}
                >
                  <h2 className={styles.sectionTitle}>
                    <span aria-hidden className={styles.marker} />
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
        {aiEnabled && !preview && (
          <AiChat slug={slug} portfolioId={portfolioId} theme="google-flat" />
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
