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
import styles from "./ModernFlatPortfolio.module.css";

function HeroGraphic() {
  return (
    <svg className={styles.heroGraphic} viewBox="0 0 600 420" aria-hidden focusable="false">
      <rect x="130" y="36" width="365" height="282" rx="8" fill="#edf3ff" />
      <rect
        x="177"
        y="78"
        width="365"
        height="250"
        rx="8"
        fill="#fff"
        stroke="#cedcf6"
        strokeWidth="2"
      />
      <path d="M177 116H542" stroke="#e2eaf9" strokeWidth="2" />
      <circle cx="198" cy="96" r="4" fill="#3f76ef" />
      <circle cx="213" cy="96" r="4" fill="#aec5f5" />
      <circle cx="228" cy="96" r="4" fill="#d3dff5" />
      <rect x="213" y="148" width="92" height="130" rx="5" fill="#eaf1ff" />
      <path
        d="M236 180L222 194L236 208M267 180L281 194L267 208M259 173L246 215"
        stroke="#3270ea"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M330 158H498M330 184H454M330 228H485M330 254H426"
        stroke="#d8e5fc"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <rect
        x="70"
        y="248"
        width="213"
        height="127"
        rx="8"
        fill="#fff"
        stroke="#bccff2"
        strokeWidth="2"
      />
      <path
        d="M100 286H186M100 311H245M100 336H219"
        stroke="#a9c7fa"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path d="M48 386H566" stroke="#d1dced" strokeWidth="2" />
      <rect x="433" y="347" width="78" height="28" rx="3" fill="#2d69dd" />
      <rect x="420" y="376" width="94" height="10" rx="2" fill="#b9cef6" />
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
                  <h2 className={styles.sectionTitle}>{sectionNames[section.id]}</h2>
                  <div className={styles.sectionContent}>
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
                  </div>
                </section>
              ),
            )}
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
