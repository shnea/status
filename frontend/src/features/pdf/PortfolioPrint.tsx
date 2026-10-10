import { hasContent, RichContent } from "@/features/content/RichContent";
import { contactHref, orderedSections, sortedSkills } from "@/features/portfolio/model";
import type { PrintDocument } from "@/features/pdf/model";
import swiss from "@/features/templates/swiss/SwissPrint.module.css";
import hud from "@/features/templates/hud/HudPrint.module.css";
import google from "@/features/templates/google-flat/GoogleFlatPrint.module.css";
import modern from "@/features/templates/modern-flat/ModernFlatPrint.module.css";
import premium from "@/features/templates/premium-dark/PremiumDarkPrint.module.css";

const printStyles = new Map([
  ["swiss", swiss],
  ["hud", hud],
  ["google-flat", google],
  ["modern-flat", modern],
  ["premium-dark", premium],
]);

export function PortfolioPrint({
  view,
  jobId,
  publicUrl,
}: {
  view: PrintDocument;
  jobId: string;
  publicUrl: string;
}) {
  const document = view.document;
  const styles = printStyles.get(document.template) || swiss;
  const fileBase = "/api/pdf/render/" + jobId + "/files/";
  const downloadBase = publicUrl + "/api/files/";

  return (
    <main
      id="content"
      tabIndex={-1}
      className={styles.page}
      data-print-root
      data-print-template={document.template}
    >
      <header className={styles.header}>
        <span>상태창</span>
        <span>{view.version === "draft" ? "임시저장본" : "최근 공개본"}</span>
      </header>
      <section className={styles.profile}>
        <div>
          <h1>{document.profile.title || document.profile.name || "이름 미등록"}</h1>
          {document.profile.introduction && <p>{document.profile.introduction}</p>}
          <ul className={styles.links}>
            {document.profile.contacts.map((contact) => (
              <li key={contact.id}>
                <a href={contactHref(contact)}>{contact.label || contact.value}</a>
              </li>
            ))}
          </ul>
        </div>
        {document.profile.imageId && (
          <img
            className={styles.avatar}
            src={fileBase + document.profile.imageId + "/content/preview"}
            alt=""
          />
        )}
      </section>
      {document.template !== "swiss" && document.profile.bannerImageId && (
        <img
          className={styles.banner}
          src={fileBase + document.profile.bannerImageId + "/content/preview"}
          alt=""
        />
      )}
      {orderedSections(document)
        .filter((section) => section.visible)
        .map((section) => {
          switch (section.id) {
            case "about":
              return (
                hasContent(document.profile.about) && (
                  <section
                    key={section.id}
                    className={styles.section}
                    data-print-section={section.id}
                  >
                    <h2>자기소개</h2>
                    <RichContent
                      content={document.profile.about}
                      fileBase={fileBase}
                      downloadBase={downloadBase}
                      className={styles.body}
                      print
                    />
                  </section>
                )
              );
            case "skills":
              return (
                document.skills.length > 0 && (
                  <section
                    key={section.id}
                    className={styles.section}
                    data-print-section={section.id}
                  >
                    <h2>스킬</h2>
                    <dl className={styles.skills}>
                      {[
                        ...new Set(sortedSkills(document.skills).map((skill) => skill.category)),
                      ].map((category) => (
                        <div key={category}>
                          <dt>{category}</dt>
                          <dd>
                            {sortedSkills(document.skills)
                              .filter((skill) => skill.category === category)
                              .map((skill) => skill.name)
                              .join(" · ")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )
              );
            case "projects":
              return (
                document.projects.length > 0 && (
                  <section
                    key={section.id}
                    className={styles.section}
                    data-print-section={section.id}
                  >
                    <h2>프로젝트</h2>
                    {document.projects.map((project) => (
                      <article className={styles.item} key={project.id}>
                        <div className={styles.itemHeading}>
                          <h3>{project.title}</h3>
                          {project.role && <span>{project.role}</span>}
                        </div>
                        {project.imageId && (
                          <img
                            className={styles.cover}
                            src={fileBase + project.imageId + "/content/preview"}
                            alt=""
                          />
                        )}
                        {project.summary && <p>{project.summary}</p>}
                        <p className={styles.subtle}>
                          {document.skills
                            .filter((skill) => project.skillIds.includes(skill.id))
                            .map((skill) => skill.name)
                            .join(" · ")}
                        </p>
                        <ul className={styles.links}>
                          {project.links.map((link) => (
                            <li key={link.id}>
                              <a href={contactHref(link)}>{link.label || link.value}</a>
                            </li>
                          ))}
                        </ul>
                        {view.publicProjectIds.includes(project.id) && (
                          <a
                            className={styles.projectLink}
                            href={publicUrl + "/@" + view.slug + "/projects/" + project.id}
                          >
                            프로젝트 상세 ↗
                          </a>
                        )}
                        <RichContent
                          content={project.content}
                          fileBase={fileBase}
                          downloadBase={downloadBase}
                          className={styles.body}
                          print
                        />
                      </article>
                    ))}
                  </section>
                )
              );
            case "history":
              return (
                document.history.length > 0 && (
                  <section
                    key={section.id}
                    className={styles.section}
                    data-print-section={section.id}
                  >
                    <h2>히스토리</h2>
                    {document.history.map((history) => (
                      <article className={styles.item} key={history.id}>
                        <div className={styles.entryHead}>
                          <p className={styles.subtle}>
                            {history.startMonth} - {history.ongoing ? "진행 중" : history.endMonth}
                          </p>
                          <div className={styles.itemHeading}>
                            <h3>{history.title}</h3>
                            <span>
                              {[history.organization, history.role].filter(Boolean).join(" / ")}
                            </span>
                          </div>
                          {history.summary && <p>{history.summary}</p>}
                        </div>
                        <RichContent
                          content={history.content}
                          fileBase={fileBase}
                          downloadBase={downloadBase}
                          className={styles.body}
                          print
                        />
                      </article>
                    ))}
                  </section>
                )
              );
            case "certifications":
              return (
                document.certifications.length > 0 && (
                  <section
                    key={section.id}
                    className={styles.section}
                    data-print-section={section.id}
                  >
                    <h2>자격 · 인증</h2>
                    {document.certifications.map((item) => (
                      <article className={styles.item} key={item.id}>
                        <h3>{item.name}</h3>
                        <p>{item.issuer}</p>
                        <p className={styles.subtle}>
                          {item.issuedOn}
                          {item.expiresOn && " - " + item.expiresOn}
                        </p>
                        {item.credentialId && <p>{item.credentialId}</p>}
                        {item.url && <a href={item.url}>인증 확인 ↗</a>}
                      </article>
                    ))}
                  </section>
                )
              );
          }
        })}
    </main>
  );
}
