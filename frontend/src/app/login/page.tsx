import type { Metadata } from "next";
import { siteSettings } from "@/lib/site-api";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "로그인", robots: { index: false, follow: false } };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const site = await siteSettings();

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          {site.serviceName}
        </a>
      </header>
      <section className={styles.hero}>
        <h1 className={styles.title}>로그인</h1>
        {error && <p role="alert">로그인을 완료하지 못했습니다. 다시 시도해주세요.</p>}
        <a className={styles.button} href="/oauth2/authorization/platform">
          플랫폼으로 로그인 ↗
        </a>
      </section>
    </main>
  );
}
