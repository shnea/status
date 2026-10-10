import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { siteSettings } from "@/lib/site-api";
import type { DesignSetting } from "@/features/templates/model";
import { samplePaths } from "@/features/templates/model";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "샘플 포트폴리오",
  robots: { index: false, follow: false },
};

export default async function DesignGallery() {
  const site = await siteSettings();
  let designs: DesignSetting[] = [];
  let failure = "";

  try {
    const response = await fetch(
      (process.env.BACKEND_URL || "http://backend:8080") + "/api/public/designs",
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );

    if (!response.ok) throw new Error("템플릿을 불러오지 못했습니다.");

    const registered: DesignSetting[] = await response.json();
    designs = registered.filter(
      (design) => design.enabled && design.implemented && samplePaths.has(design.id),
    );
  } catch {
    failure = "템플릿을 불러오지 못했습니다.";
  }

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          {site.serviceName}
        </a>
        <a className={styles.start} href="/oauth2/authorization/platform">
          시작하기 <ArrowUpRight size={18} aria-hidden />
        </a>
      </header>
      <h1 className={styles.title}>템플릿 선택</h1>
      {failure ? (
        <div role="alert" className={styles.message}>
          <p>{failure}</p>
          <a href="/design-preview">다시 불러오기 ↗</a>
        </div>
      ) : designs.length === 0 ? (
        <p className={styles.message}>선택할 수 있는 템플릿이 없습니다.</p>
      ) : (
        <div className={styles.designs}>
          {designs.map((design) => (
            <a key={design.id} className={styles.design} href={samplePaths.get(design.id)}>
              <div className={styles.preview} aria-hidden inert>
                <iframe
                  className={styles.frame}
                  src={samplePaths.get(design.id)}
                  title={design.title + " 샘플"}
                  tabIndex={-1}
                  loading="lazy"
                />
              </div>
              <div className={styles.label}>
                <h2>{design.title}</h2>
                <ArrowUpRight size={22} aria-hidden />
              </div>
              {design.isDefault && <span className={styles.badge}>기본</span>}
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
