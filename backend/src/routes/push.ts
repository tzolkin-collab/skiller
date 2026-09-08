/**
 * Inscrição e teste de notificação, do lado do navegador.
 *
 * A chave pública sai por rota em vez de `NEXT_PUBLIC_`: o painel já fala só
 * com o próprio domínio e o endereço do backend não viaja no bundle. Manter a
 * chave fora do build também deixa trocá-la sem recompilar o front.
 */
import { Hono } from 'hono';
import { usuarioAtual, naoAutenticado } from '../lib/current-user.js';
import {
  chavePublica, inscrever, desinscrever, contarInscricoes, avisar, chavesValidas,
  motivoDesligado,
} from '../lib/push.js';

export const pushRouter = new Hono();

/** Pública por natureza — é o que o navegador precisa para se inscrever. */
pushRouter.get('/key', (c) => {
  const key = chavePublica();
  return key ? c.json({ key }) : c.json({ error: 'push_desligado' }, 503);
});

pushRouter.post('/subscribe', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';

  // Vem do navegador, então nada é presumido. O endpoint precisa ser https de
  // verdade: é para ele que o servidor vai fazer POST depois, e aceitar
  // qualquer string aqui seria deixar o cliente escolher o destino.
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 2048) {
    return c.json({ error: 'subscription_invalida' }, 400);
  }
  // Tamanho das chaves conferido aqui, na porta: inscricao malformada nunca
  // consegue receber nada e, por nao chegar a fazer requisicao, nunca ganha o
  // 404 que a limparia depois.
  if (!chavesValidas(p256dh, auth)) {
    return c.json({ error: 'chaves_invalidas' }, 400);
  }

  await inscrever({
    userId,
    endpoint,
    p256dh,
    auth,
    userAgent: c.req.header('user-agent') ?? null,
  });

  return c.json({ ok: true, dispositivos: await contarInscricoes(userId) });
});

pushRouter.post('/unsubscribe', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const body = (await c.req.json().catch(() => ({}))) as { endpoint?: unknown };
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) return c.json({ error: 'endpoint_obrigatorio' }, 400);

  await desinscrever(userId, endpoint);
  return c.json({ ok: true, dispositivos: await contarInscricoes(userId) });
});

/**
 * Manda um aviso para os próprios aparelhos de quem chamou.
 *
 * Só para si: é o botão "testar" da tela de configurações. Disparo para outra
 * pessoa não passa por aqui, e disparo para a base inteira não existe — quando
 * existir, precisa de tela própria, com contagem de destinatários e confirmação.
 */
pushRouter.post('/test', async (c) => {
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  // Diagnostico antes do envio: sem isto, chave mal colada no painel de deploy
  // devolvia 500 generico e mandava procurar o problema no aparelho, que era o
  // unico lugar onde ele nao estava.
  const desligado = motivoDesligado();
  if (desligado) return c.json({ error: 'push_desligado', message: desligado }, 503);

  const dispositivos = await contarInscricoes(userId);
  if (dispositivos === 0) {
    return c.json({ ok: true, entregues: 0, dispositivos: 0 });
  }

  const entregues = await avisar(userId, {
    title: 'Skiller',
    body: 'Notificacoes ligadas. E assim que o agente vai te chamar quando parar para esperar.',
    url: '/pt/dashboard/settings',
    tag: 'teste',
  });

  return c.json({ ok: true, entregues, dispositivos });
});
