/**
 * Sessão espelho — a linha do tempo que o humano abre para assistir.
 *
 * Criar skill pelo MCP é um laço de agente: várias chamadas ao longo de
 * minutos, com o modelo puxando material, montando o documento e gravando.
 * Sem isto a pessoa fica olhando para a IDE sem saber o que está acontecendo do
 * nosso lado — e essa era a única vantagem real que o caminho do app tinha
 * sobre o conector.
 *
 * O link devolvido é PONTEIRO, não credencial: `/dashboard/sessions/{id}` só
 * abre para quem tem sessão no navegador e é dono. Isso não é zelo — o link é
 * entregue a um LLM e vai parar no histórico da conversa dele, em log, e
 * possivelmente numa tela compartilhada. Token na URL viraria capacidade
 * portátil; id sozinho não vale nada sem login.
 */
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/db.js';
import { mcpSessions, mcpSessionEvents } from '../db/schema.js';

export type TipoEvento = 'info' | 'ok' | 'warn' | 'error';

/** Onde a pessoa assiste. Sai do frontend, não do backend. */
function appUrl(): string {
  return (process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export function urlDaSessao(id: string, lang = 'pt'): string {
  return `${appUrl()}/${lang}/dashboard/sessions/${id}`;
}

/**
 * Tempo sem nenhuma atualização depois do qual uma sessão aberta é tratada como
 * abandonada. Meia hora é folgado para o laço de criação de skill, que leva
 * minutos, e curto o bastante para a sessão de ontem não voltar do túmulo.
 */
const SESSAO_OCIOSA_MS = 30 * 60 * 1000;

export async function abrirSessao(opts: {
  userId: string;
  title?: string | null;
  client?: string | null;
}): Promise<{ id: string; url: string }> {
  // Singleton: verifica se já há uma sessão open para esse usuário.
  // `orderBy` porque `limit(1)` sem ordem devolve linha arbitrária — e o
  // singleton não é garantido pelo banco: o check-then-insert abaixo não é
  // atômico, então duas aberturas simultâneas deixam duas sessões abertas.
  const [ativa] = await db
    .select({ id: mcpSessions.id, updatedAt: mcpSessions.updatedAt })
    .from(mcpSessions)
    .where(and(eq(mcpSessions.userId, opts.userId), eq(mcpSessions.status, 'open')))
    .orderBy(desc(mcpSessions.updatedAt))
    .limit(1);

  // Reaproveitar a sessão aberta é o certo enquanto ela está viva: o agente que
  // reabre no meio do trabalho continua na mesma linha do tempo em vez de
  // fragmentá-la. Mas sessão abandonada não fechava sozinha — `fecharSessao` só
  // é chamada na criação de skill — então a sessão de ontem, parada esperando
  // fontes que nunca vieram, sequestrava a próxima: o agente seguinte recebia o
  // id dela achando que tinha aberto uma sessão nova, e herdava o `awaiting` e
  // os eventos da anterior.
  const viva = ativa && Date.now() - ativa.updatedAt.getTime() < SESSAO_OCIOSA_MS;

  if (ativa && viva) {
    // Atualiza o título e retorna a existente
    await db
      .update(mcpSessions)
      .set({ title: opts.title ?? null, client: opts.client ?? null, updatedAt: new Date() })
      .where(eq(mcpSessions.id, ativa.id));
    return { id: ativa.id, url: urlDaSessao(ativa.id) };
  }

  if (ativa) await fecharSessao(ativa.id, 'abandoned');

  const [s] = await db
    .insert(mcpSessions)
    .values({ userId: opts.userId, title: opts.title ?? null, client: opts.client ?? null })
    .returning({ id: mcpSessions.id });
  return { id: s.id, url: urlDaSessao(s.id) };
}

/**
 * Registra um evento. Nunca lança.
 *
 * Falha de espelho não pode derrubar o trabalho que ele espelha: se a gravação
 * do evento quebrar, a criação da skill segue. O contrário — perder a skill
 * porque a linha do tempo falhou — seria trocar o essencial pelo acessório.
 */
export async function registrarEvento(
  sessionId: string | null | undefined,
  kind: TipoEvento,
  message: string,
  detail?: unknown
): Promise<void> {
  if (!sessionId) return;
  try {
    // `seq` vem de uma subconsulta em vez de contador em memória: com mais de
    // um processo servindo MCP, contador local daria números repetidos.
    await db.insert(mcpSessionEvents).values({
      sessionId,
      seq: sql`(SELECT COALESCE(MAX(${mcpSessionEvents.seq}), 0) + 1 FROM ${mcpSessionEvents} WHERE ${mcpSessionEvents.sessionId} = ${sessionId})`,
      kind,
      message,
      detail: detail === undefined ? null : (detail as object),
    });
    await db
      .update(mcpSessions)
      .set({ updatedAt: new Date() })
      .where(eq(mcpSessions.id, sessionId));
  } catch (e) {
    console.warn('[sessao] evento não registrado:', e instanceof Error ? e.message : e);
  }
}

import { users } from '../db/schema.js';
import { can } from './plans.js';
import { ingest } from './kb-tools.js';

/**
 * Fecha a sessão. Também tolerante a falha, pelo mesmo motivo.
 *
 * `abandoned` é para sessão que ninguém terminou — o agente sumiu, o usuário
 * fechou a aba. Não arquiva na Base: só `done` vira página, porque log de
 * trabalho interrompido é ruído, não conhecimento.
 */
export async function fecharSessao(
  sessionId: string | null | undefined,
  status: 'done' | 'error' | 'abandoned' = 'done'
): Promise<void> {
  if (!sessionId) return;
  try {
    await db
      .update(mcpSessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(mcpSessions.id, sessionId));

    if (status === 'done') {
      // Arquivamento na Base da IA
      const [s] = await db
        .select({ userId: mcpSessions.userId, title: mcpSessions.title })
        .from(mcpSessions)
        .where(eq(mcpSessions.id, sessionId));

      if (s) {
        const [u] = await db
          .select({ plan: users.plan })
          .from(users)
          .where(eq(users.id, s.userId));

        if (u && can(u.plan, 'kb')) {
          const eventos = await eventosDaSessao(sessionId);
          if (eventos.length > 0) {
            const lines = eventos.map(e => {
              const tempo = e.createdAt.toLocaleTimeString('pt-BR');
              const detalhe = e.detail ? `\n\`\`\`json\n${JSON.stringify(e.detail, null, 2)}\n\`\`\`` : '';
              return `**[${tempo}] ${e.kind.toUpperCase()}**: ${e.message}${detalhe}`;
            });
            const body = `# Log da Sessão: ${s.title || sessionId}\n\n${lines.join('\n\n')}`;
            
            await ingest(s.userId, {
              title: `Sessão: ${s.title || sessionId}`,
              type: 'output',
              body,
              tags: ['session-log', 'mcp'],
              sources: [`session:${sessionId}`]
            }).catch(err => console.warn('[sessao] falha no ingest:', err));
          }
        }
      }
    }
  } catch (e) {
    console.warn('[sessao] erro ao fechar sessão:', e);
  }
}

/**
 * Confirma que a sessão existe E é desta conta.
 *
 * O filtro por dono é o que faz o id ser ponteiro: sem ele, adivinhar um uuid
 * daria acesso à linha do tempo de outra pessoa.
 */
export async function sessaoDoDono(
  sessionId: string,
  userId: string
): Promise<{ id: string; title: string | null; status: string; createdAt: Date } | null> {
  const [s] = await db
    .select({
      id: mcpSessions.id,
      title: mcpSessions.title,
      status: mcpSessions.status,
      createdAt: mcpSessions.createdAt,
    })
    .from(mcpSessions)
    .where(and(eq(mcpSessions.id, sessionId), eq(mcpSessions.userId, userId)))
    .limit(1);
  return s ?? null;
}

export async function eventosDaSessao(sessionId: string, depoisDe = 0) {
  return db
    .select({
      seq: mcpSessionEvents.seq,
      kind: mcpSessionEvents.kind,
      message: mcpSessionEvents.message,
      detail: mcpSessionEvents.detail,
      createdAt: mcpSessionEvents.createdAt,
    })
    .from(mcpSessionEvents)
    .where(and(eq(mcpSessionEvents.sessionId, sessionId), sql`${mcpSessionEvents.seq} > ${depoisDe}`))
    .orderBy(mcpSessionEvents.seq);
}

/** Para onde mandar o humano quando a sessão pede fontes. */
export function urlDeFontes(id: string, lang = 'pt'): string {
  // `/dashboard`, não `/dashboard/watch`.
  //
  // Quem recebe a seleção é o FloatingCart: com `?sessao=` na URL, o botão dele
  // deixa de gerar e passa a mandar as fontes para a sessão. Ele monta em dois
  // lugares, e só um deles serve. `/dashboard/watch` exige `?v=<videoId>` e,
  // sem ele, devolve "No video selected." antes de montar componente nenhum —
  // então o link que o agente entregava abria uma tela onde não havia o que
  // escolher nem como enviar. `/dashboard` é a tela de busca, onde os vídeos
  // estão.
  return `${appUrl()}/${lang}/dashboard?sessao=${id}`;
}

/**
 * O agente para e pede fontes ao humano.
 *
 * É o que torna a sessão mão dupla em vez de espelho: sem isto o agente teria
 * que adivinhar de onde tirar o conhecimento, ou o humano teria que colar URLs
 * na IDE — que é justamente o trabalho que a tela de seleção já faz melhor.
 */
export async function pedirFontes(sessionId: string): Promise<void> {
  await db
    .update(mcpSessions)
    .set({ awaiting: 'sources', handoff: null, updatedAt: new Date() })
    .where(eq(mcpSessions.id, sessionId));
}

/** O humano devolveu a seleção. Fecha o pedido e guarda o resultado. */
export async function receberFontes(
  sessionId: string,
  userId: string,
  urls: string[]
): Promise<boolean> {
  const dona = await sessaoDoDono(sessionId, userId);
  if (!dona) return false;
  await db
    .update(mcpSessions)
    .set({ awaiting: null, handoff: { sources: urls }, updatedAt: new Date() })
    .where(eq(mcpSessions.id, sessionId));
  await registrarEvento(sessionId, 'ok', `${urls.length} fonte(s) selecionada(s) pelo usuário.`, { sources: urls });
  return true;
}

/** Estado que o agente lê para saber se pode seguir. */
export async function estadoDaSessao(sessionId: string, userId: string) {
  const [s] = await db
    .select({
      id: mcpSessions.id,
      title: mcpSessions.title,
      status: mcpSessions.status,
      awaiting: mcpSessions.awaiting,
      handoff: mcpSessions.handoff,
    })
    .from(mcpSessions)
    .where(and(eq(mcpSessions.id, sessionId), eq(mcpSessions.userId, userId)))
    .limit(1);
  return s ?? null;
}
