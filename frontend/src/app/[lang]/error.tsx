'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import styles from './error.module.css';

/**
 * Segment-level boundary: the root layout still applies here, so fonts and
 * globals.css are available. Copy is inlined rather than read from the
 * dictionaries because `getDictionary` is server-only and this is a client
 * component.
 */
const COPY = {
  en: { label: 'Error', title: 'Something went wrong.', retry: 'Try again', home: 'Back to home' },
  pt: { label: 'Erro', title: 'Algo deu errado.', retry: 'Tentar de novo', home: 'Voltar ao início' },
  es: { label: 'Error', title: 'Algo salió mal.', retry: 'Intentar de nuevo', home: 'Volver al inicio' },
  fr: { label: 'Erreur', title: "Une erreur s'est produite.", retry: 'Réessayer', home: "Retour à l'accueil" },
} as const;

type Locale = keyof typeof COPY;

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const raw = typeof params?.lang === 'string' ? params.lang : 'en';
  const copy = COPY[raw as Locale] ?? COPY.en;

  useEffect(() => {
    // AGENTS.md rule 5: errors are data — never swallow them.
    console.error('[segment-error]', error);
  }, [error]);

  return (
    <div className={styles.container}>
      <main className={styles.panel}>
        <p className={styles.label}>{copy.label}</p>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.message}>{error.message || '—'}</p>
        {error.digest && <p className={styles.digest}>digest: {error.digest}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={reset}>
            {copy.retry}
          </button>
          <a className={styles.secondaryBtn} href={`/${raw}`}>
            {copy.home}
          </a>
        </div>
      </main>
    </div>
  );
}
