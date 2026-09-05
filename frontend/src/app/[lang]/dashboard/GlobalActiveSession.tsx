"use client";

import useSWR from 'swr';
import Link from 'next/link';
import { Loader2, ArrowRight, ExternalLink } from 'lucide-react';
import styles from './GlobalActiveSession.module.css';
import { BASE_URL } from '@/lib/api-base';

interface ActiveSessionData {
  active: boolean;
  session?: {
    id: string;
    title: string | null;
    awaiting: string | null;
    lastEvent: {
      kind: string;
      message: string;
      at: string;
    } | null;
  };
}

const fetcher = (url: string) => fetch(url, { credentials: 'omit' }).then((res) => {
  if (!res.ok) throw new Error('Falha ao carregar sessão');
  return res.json();
});

export function GlobalActiveSession({ lang }: { lang: string }) {
  const { data, error } = useSWR<ActiveSessionData>(`${BASE_URL}/api/sessions/active`, fetcher, {
    refreshInterval: 3000, // Poll a cada 3s
  });

  if (error || !data || !data.active || !data.session) {
    return null; // Não mostra nada se não houver sessão ativa
  }

  const sess = data.session;
  
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.statusSection}>
          <Loader2 size={16} className={styles.spinner} />
          <div className={styles.textStack}>
            <span className={styles.title}>
              Sessão MCP Ativa: {sess.title || sess.id.slice(0,8)}
            </span>
            {sess.lastEvent && (
              <span className={styles.lastEvent}>
                {sess.lastEvent.message}
              </span>
            )}
          </div>
        </div>

        <div className={styles.actionSection}>
          {sess.awaiting === 'sources' ? (
            <Link href={`/${lang}/dashboard/watch?sessao=${sess.id}`} className={styles.actionButton}>
              Selecionar Fontes <ArrowRight size={14} />
            </Link>
          ) : (
            <Link href={`/${lang}/dashboard/sessions/${sess.id}`} className={styles.viewButton}>
              Acompanhar <ExternalLink size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
