import Link from 'next/link';
import styles from './[lang]/error.module.css';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <main className={styles.panel}>
        <p className={styles.label}>404</p>
        <h1 className={styles.title}>This page does not exist.</h1>
        <p className={styles.message}>The address may be wrong, or the page may have moved.</p>

        <div className={styles.actions}>
          <Link className={styles.primaryBtn} href="/">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
