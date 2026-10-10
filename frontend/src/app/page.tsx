import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { siteSettings } from "@/lib/site-api";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await siteSettings();

  return {
    metadataBase: new URL(process.env.APP_PUBLIC_URL || "http://localhost:30165"),
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      title: site.serviceName,
      locale: "ko_KR",
      siteName: site.serviceName,
      url: "/",
      images: [{ url: site.shareImageUrl, width: 1200, height: 630, alt: site.serviceName }],
    },
    twitter: { card: "summary_large_image", title: site.serviceName, images: [site.shareImageUrl] },
    verification: process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

export default async function Home() {
  const site = await siteSettings();

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.brand}>
          {site.serviceName}
        </a>
        <a href="/dashboard">내 포트폴리오 ↗</a>
      </header>
      {site.announcement && (
        <aside className={styles.announcement} aria-label="서비스 공지">
          {site.announcement}
        </aside>
      )}
      <section className={styles.hero}>
        <h1 className={styles.title}>
          <span className={styles.line}>나를 보여주는</span>
          <span className={styles.line}>하나의 창.</span>
        </h1>
        <div className={styles.bottom}>
          <a className={styles.button} href="/oauth2/authorization/platform">
            시작하기 <ArrowUpRight size={20} aria-hidden />
          </a>
          <a className={styles.sampleLink} href="/design-preview">
            샘플 포트폴리오 보기 <ArrowUpRight size={18} aria-hidden />
          </a>
        </div>
      </section>
    </main>
  );
}
