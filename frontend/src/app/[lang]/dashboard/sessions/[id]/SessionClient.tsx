'use client';

/**
 * Sessão espelho: o humano assiste o agente conectado trabalhando.
 *
 * Polling com SWR, e não WebSocket, porque é o padrão que o resto do painel já
 * usa (`SkillClient.tsx`) e porque a granularidade aqui é de segundos — um
 * evento por etapa do agente, não um fluxo contínuo.
 *
 * A página é só leitura. Assistir não aprova, não edita e não dispara nada: o
 * link chega ao navegador vindo de um LLM, e uma superfície que agisse viraria
 * vetor de ataque a partir de um link vazado.
 */
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Info, TriangleAlert, CircleX, Loader2 } from 'lucide-react';
import styles from './page.module.css';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

type Kind = 'info' | 'ok' | 'warn' | 'error';

interface Evento {
  seq: number;
  kind: Kind;
  message: string;
  detail: unknown;
  at: string;
}

interface Sessao {
  id: string;
  title: string | null;
  status: 'open' | 'done' | 'error';
  createdAt: string;
  events: Evento[];
}

const fetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((r) => {
    if (r.status === 404) throw new Error('nao_encontrada');
    if (r.status === 401) throw new Error('sem_sessao');
    if (!r.ok) throw new Error('falhou');
    return r.json();
  });

const ICONE: Record<Kind, typeof Info> = {
  info: Info,
  ok: Check,
  warn: TriangleAlert,
  error: CircleX,
};

function horario(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function SessionClient({ lang, id }: { lang: string; id: string }) {
  const router = useRouter();
  const pt = lang === 'pt';

  const { data, error } = useSWR<Sessao>(`${BASE_URL}/api/sessions/${id}`, fetcher, {
    // Enquanto a sessão está aberta, atualiza rápido; depois de fechada, para
    // de pedir — o conteúdo não muda mais e polling eterno é desperdício.
    refreshInterval: (dados) => (dados?.status === 'open' ? 1500 : 0),
    revalidateOnFocus: true,
  });

  const emAndamento = data?.status === 'open';

  return (
    <div className={styles.pagina}>
      <button className={styles.voltar} onClick={() => router.push(`/${lang}/dashboard`)}>
        <ArrowLeft size={14} />
        <span>{pt ? 'Voltar ao painel' : 'Back to dashboard'}</span>
      </button>

      {error ? (
        <div className={styles.vazio}>
          <p className={styles.vazioTitulo}>
            {error.message === 'sem_sessao'
              ? pt ? 'Entre para ver esta sessão' : 'Sign in to view this session'
              : pt ? 'Sessão não encontrada' : 'Session not found'}
          </p>
          <p className={styles.vazioTexto}>
            {error.message === 'sem_sessao'
              ? pt
                ? 'O link aponta para uma sessão da sua conta. Ele não funciona sozinho — é preciso estar conectado.'
                : 'This link points to a session in your account. It does not work on its own — you need to be signed in.'
              : pt
                ? 'Ela não existe ou pertence a outra conta.'
                : 'It does not exist or belongs to another account.'}
          </p>
        </div>
      ) : null}

      {!error && !data ? <p className={styles.carregando}>{pt ? 'Carregando…' : 'Loading…'}</p> : null}

      {data ? (
        <>
          <header className={styles.cabecalho}>
            <div className={styles.tituloLinha}>
              <h1 className={styles.titulo}>
                {data.title ?? (pt ? 'Sessão do agente' : 'Agent session')}
              </h1>
              <span className={`${styles.selo} ${styles[`selo_${data.status}`]}`}>
                {emAndamento ? <Loader2 size={12} className={styles.girando} /> : null}
                {data.status === 'open'
                  ? pt ? 'em andamento' : 'running'
                  : data.status === 'done'
                    ? pt ? 'concluída' : 'done'
                    : pt ? 'interrompida' : 'failed'}
              </span>
            </div>
            <p className={styles.subtitulo}>
              {pt ? 'Iniciada às ' : 'Started at '}
              {horario(data.createdAt)}
              {' · '}
              {data.events.length} {pt ? 'eventos' : 'events'}
            </p>
          </header>

          <ol className={styles.linha}>
            {data.events.map((e) => {
              const Icone = ICONE[e.kind];
              return (
                <li key={e.seq} className={`${styles.evento} ${styles[`ev_${e.kind}`]}`}>
                  <span className={styles.marcador}>
                    <Icone size={13} />
                  </span>
                  <div className={styles.corpo}>
                    <p className={styles.mensagem}>{e.message}</p>
                    {e.detail ? (
                      <pre className={styles.detalhe}>{JSON.stringify(e.detail, null, 2)}</pre>
                    ) : null}
                  </div>
                  <time className={styles.hora}>{horario(e.at)}</time>
                </li>
              );
            })}

            {emAndamento ? (
              <li className={`${styles.evento} ${styles.ev_pendente}`}>
                <span className={styles.marcador}>
                  <Loader2 size={13} className={styles.girando} />
                </span>
                <div className={styles.corpo}>
                  <p className={styles.mensagem}>
                    {pt ? 'Aguardando o agente…' : 'Waiting for the agent…'}
                  </p>
                </div>
              </li>
            ) : null}
          </ol>

          {data.events.length === 0 && !emAndamento ? (
            <p className={styles.carregando}>{pt ? 'Nenhum evento.' : 'No events.'}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
