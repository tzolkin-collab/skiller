/**
 * A sessão espelho, do lado do navegador.
 *
 * Duas superfícies com pesos diferentes. A leitura (`GET /:id`) só mostra: não
 * aprova, não edita, não dispara nada — o link chega ao navegador vindo de um
 * LLM, e uma tela que agisse viraria vetor a partir de um link vazado.
 *
 * A escrita (`POST /:id/sources`) existe porque a sessão é mão dupla: o agente
 * para e pede as fontes, e a pessoa responde pela tela de seleção que o produto
 * já tem. É deliberadamente estreita — recebe URLs e nada mais, e não dispara
 * geração. Quem decide o que fazer com as fontes é o agente.
 *
 * As duas exigem sessão no navegador e conferem posse. É isso que faz o id ser
 * ponteiro em vez de credencial.
 */
import { Hono } from 'hono';
import { usuarioAtual, naoAutenticado } from '../lib/current-user.js';
import { sessaoDoDono, eventosDaSessao, receberFontes } from '../lib/mcp-sessions.js';

export const sessionsRouter = new Hono();

sessionsRouter.get('/:id', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const id = c.req.param('id');
  const sessao = await sessaoDoDono(id, userId);
  // 404 e não 403: dizer "existe mas não é sua" confirma a existência de uma
  // sessão de outra pessoa para quem estiver adivinhando uuid.
  if (!sessao) return c.json({ error: 'not_found' }, 404);

  // `desde` deixa a página pedir só o que ainda não viu, em vez de rebaixar a
  // linha inteira a cada intervalo de polling.
  const desde = Number(c.req.query('desde') ?? 0);
  const eventos = await eventosDaSessao(id, Number.isFinite(desde) ? desde : 0);

  return c.json({
    id: sessao.id,
    title: sessao.title,
    status: sessao.status,
    createdAt: sessao.createdAt.toISOString(),
    events: eventos.map((e) => ({
      seq: e.seq,
      kind: e.kind,
      message: e.message,
      detail: e.detail,
      at: e.createdAt.toISOString(),
    })),
  });
});

/**
 * O humano devolve a seleção de fontes para a sessão.
 *
 * Única rota de escrita desta superfície, e por isso a mais estreita: aceita um
 * array de URLs, exige sessão no navegador, e o `receberFontes` confere a posse
 * antes de gravar. Não dispara geração — quem decide o que fazer com as fontes
 * é o agente, do outro lado.
 */
sessionsRouter.post('/:id/sources', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const body = (await c.req.json().catch(() => ({}))) as { sources?: unknown };
  const brutas = Array.isArray(body.sources) ? body.sources : null;
  if (!brutas || brutas.length === 0) {
    return c.json({ error: 'sources_required', message: 'Selecione ao menos uma fonte.' }, 400);
  }

  // Teto e formato: isto vem do navegador, então não confiamos no tamanho nem
  // no conteúdo. 200 é bem acima de qualquer playlist real e bem abaixo do que
  // encheria a coluna.
  const urls = brutas
    .filter((u): u is string => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u) && u.length <= 2048)
    .slice(0, 200);

  if (urls.length === 0) {
    return c.json({ error: 'sources_invalid', message: 'Nenhuma URL válida na seleção.' }, 400);
  }

  const ok = await receberFontes(c.req.param('id'), userId, urls);
  if (!ok) return c.json({ error: 'not_found' }, 404);

  return c.json({ ok: true, count: urls.length });
});
