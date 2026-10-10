import styles from "./page.module.css";

export default function NotFound() {
  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <a className={styles.brand} href="/">
        상태창
      </a>
      <section className={styles.hero}>
        <h1 style={{ fontSize: 48, letterSpacing: "-.06em" }}>페이지를 찾을 수 없습니다.</h1>
        <a className={styles.button} href="/">
          메인으로 ↗
        </a>
      </section>
    </main>
  );
}
