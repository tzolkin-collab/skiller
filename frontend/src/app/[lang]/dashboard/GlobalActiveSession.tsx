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

// `include` como todo o resto do painel: /api/sessions/active resolve o dono
// pelo cookie de sessao. Com `omit` a chamada saia sem cookie, voltava 401, o
// SWR marcava erro e o componente devolvia null — o aviso de sessao ativa nunca
// aparecia para ninguem, e quem perdia a aba no meio de uma sessao ficava sem
// caminho de volta.
const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((res) => {
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

  // O destino de "Selecionar Fontes" e' `/dashboard`, nao `/dashboard/watch`:
  // quem recebe a selecao e' o FloatingCart, que monta junto da busca. Em
  // /watch, sem `?v=`, a pagina para em "No video selected." e nao ha' o que
  // escolher — era para la' que este botao apontava.

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
            <Link href={`/${lang}/dashboard?sessao=${sess.id}`} className={styles.actionButton}>
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
