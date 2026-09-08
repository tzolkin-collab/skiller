/**
 * Web Push — o aviso que alcança a pessoa longe da tela.
 *
 * Existe porque a sessão espelho é de mão dupla e o agente às vezes PARA para
 * esperar: `pedirFontes` deixa a sessão em `awaiting` e não há mais nada a
 * fazer até um humano voltar. Sem push, "voltar" depende de a pessoa lembrar
 * sozinha — foi assim que uma sessão nossa ficou parada um dia inteiro.
 *
 * Custo zero e sem cadastro: VAPID é um par de chaves que geramos, e os
 * serviços de push (Apple, Google, Mozilla) não cobram. O payload vai cifrado
 * com as chaves da própria inscrição, então o serviço do fabricante entrega sem
 * conseguir ler.
 *
 * No iPhone há uma condição que decide a adoção: só chega se o PWA estiver na
 * tela de início. Safari em aba não recebe, por mais que a permissão seja
 * concedida.
 */
import webpush from 'web-push';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/db.js';
import { pushSubscriptions } from '../db/schema.js';

export interface Aviso {
  title: string;
  body: string;
  /** Caminho relativo que o clique abre. Ex.: `/pt/dashboard?sessao=x`. */
  url?: string;
  /**
   * Agrupa avisos: um `tag` repetido substitui o anterior na tela em vez de
   * empilhar. Use o id da sessão para não enfileirar cinco "escolha as fontes".
   */
  tag?: string;
}

let configurado: boolean | null = null;

/**
 * Configura o web-push na primeira chamada.
 *
 * Sem chave, a função devolve `false` e todo envio vira no-op silencioso — é
 * deliberado: em desenvolvimento e em qualquer ambiente sem VAPID, notificação
 * ausente não pode derrubar o fluxo que ela apenas acompanha.
 */
function pronto(): boolean {
  if (configurado !== null) return configurado;

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:contato@skiller.app';

  if (!pub || !priv) {
    console.warn('[push] VAPID ausente — notificações desligadas.');
    configurado = false;
    return false;
  }

  webpush.setVapidDetails(subject, pub, priv);
  configurado = true;
  return true;
}

/** A pública pode circular: é ela que o navegador usa para se inscrever. */
export function chavePublica(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/**
 * Confere o formato das chaves da inscrição.
 *
 * O Web Push fixa os tamanhos: `p256dh` é um ponto não-comprimido da curva
 * P-256, 65 bytes, e `auth` são 16 bytes. Validar na porta é o que impede a
 * inscrição inútil de entrar — sem isto ela vira zumbi: a cifragem falha antes
 * de qualquer requisição, então nunca chega o 404 que a apagaria, e a linha é
 * reprocessada em todo envio para sempre. Descobri isso testando com chave
 * falsa, que ficou no banco depois da limpeza.
 */
export function chavesValidas(p256dh: string, auth: string): boolean {
  try {
    return (
      Buffer.from(p256dh, 'base64url').length === 65 && Buffer.from(auth, 'base64url').length === 16
    );
  } catch {
    return false;
  }
}

export async function inscrever(opts: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  // O endpoint é único: reinscrever o mesmo aparelho atualiza as chaves em vez
  // de criar linha nova. O navegador rotaciona a subscription sozinho de tempos
  // em tempos, e sem isto cada rotação viraria um destinatário duplicado.
  await db
    .insert(pushSubscriptions)
    .values({
      userId: opts.userId,
      endpoint: opts.endpoint,
      p256dh: opts.p256dh,
      auth: opts.auth,
      userAgent: opts.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: opts.userId,
        p256dh: opts.p256dh,
        auth: opts.auth,
        userAgent: opts.userAgent ?? null,
        lastSeenAt: new Date(),
      },
    });
}

export async function desinscrever(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function contarInscricoes(userId: string): Promise<number> {
  const linhas = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return linhas.length;
}

/**
 * Envia para todos os aparelhos de uma pessoa.
 *
 * Devolve quantos receberam. Nunca lança: notificação é acessório do trabalho,
 * e derrubar a criação de uma skill porque o aviso falhou seria trocar o
 * essencial pelo enfeite — mesma regra do espelho.
 */
export async function avisar(userId: string, aviso: Aviso): Promise<number> {
  if (!pronto()) return 0;

  const inscricoes = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (inscricoes.length === 0) return 0;

  const payload = JSON.stringify({
    title: aviso.title,
    body: aviso.body,
    url: aviso.url ?? '/pt/dashboard',
    tag: aviso.tag,
  });

  let entregues = 0;

  await Promise.all(
    inscricoes.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        entregues++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        const codigo = (e as { code?: string }).code ?? '';

        // Duas mortes diferentes, mesmo destino.
        //
        // 404/410 é o serviço dizendo que o aparelho não existe mais — PWA
        // desinstalado, permissão revogada.
        //
        // ERR_CRYPTO_* é a inscrição ter chave inválida: a cifragem falha aqui,
        // antes de qualquer requisição, e vai falhar igual em toda tentativa
        // futura. Sem tratar, essa linha vira zumbi permanente, reprocessada em
        // todo envio para sempre. Só descobri porque o teste com chave falsa
        // não chegou na rede.
        //
        // O que NÃO entra aqui é falha de rede (ECONNRESET, timeout): essa é
        // transitória, e apagar por causa dela perderia inscrição boa.
        // O web-push valida o tamanho da chave antes de cifrar e lanca um
        // Error simples, sem `code` nem `statusCode` — por isso a mensagem
        // entra na conta. Cobre a inscricao que ja' estava no banco antes de
        // existir a validacao na porta.
        const mensagem = e instanceof Error ? e.message : '';
        const morta =
          status === 404 ||
          status === 410 ||
          codigo.startsWith('ERR_CRYPTO') ||
          /should be \d+ bytes long/.test(mensagem);

        if (morta) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)).catch(() => {});
          return;
        }
        // `??` não cai para o próximo quando `codigo` é string vazia, então o
        // aviso saía em branco justamente quando havia mais a dizer.
        console.warn(
          `[push] falha ao enviar: status=${status ?? '-'} code=${codigo || '-'} ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    })
  );

  return entregues;
}
