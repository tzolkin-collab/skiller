/**
 * Identidade: senha, sessão e limite de tentativas.
 *
 * Escolhas que valem explicar:
 *
 *  - **scrypt do `node:crypto`**, não bcrypt/argon2. É a única função de
 *    derivação lenta que vem na plataforma, com parâmetros ajustáveis. Uma
 *    dependência nativa a menos num caminho que não pode falhar no deploy.
 *
 *  - **Token opaco, não JWT.** JWT não se revoga: encerrar sessão exigiria uma
 *    lista negra, que é exatamente a tabela que o token opaco já é. E o cookie
 *    fica menor.
 *
 *  - **Só o hash do token vai para o banco.** Um dump do banco não entrega
 *    sessão ativa de ninguém — mesma razão de não guardar senha em claro.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db/db.js';
import { sessions, users, emailTokens, rateLimits } from '../db/schema.js';

const scrypt = promisify(crypto.scrypt) as (
  senha: string, sal: Buffer, tamanho: number, opts: crypto.ScryptOptions
) => Promise<Buffer>;

// ------------------------------------------------------------------- senha

/**
 * Custo do scrypt. `N=2^15` leva ~100ms num servidor comum: irrelevante para
 * quem entra uma vez, caro para quem tenta um dicionário inteiro.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, tamanho: 32, maxmem: 64 * 1024 * 1024 };

export async function hashSenha(senha: string): Promise<string> {
  const sal = crypto.randomBytes(16);
  const derivado = await scrypt(senha.normalize('NFKC'), sal, SCRYPT.tamanho, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64'), derivado.toString('base64')].join('$');
}

/**
 * Confere a senha.
 *
 * Os parâmetros saem do próprio hash, e não da constante: assim aumentar o
 * custo no futuro não invalida quem já tem senha cadastrada.
 */
export async function conferirSenha(senha: string, guardado: string | null): Promise<boolean> {
  if (!guardado) return false;
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const [, n, r, p, salB64, hashB64] = partes;
  try {
    const esperado = Buffer.from(hashB64, 'base64');
    const derivado = await scrypt(senha.normalize('NFKC'), Buffer.from(salB64, 'base64'), esperado.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
    // Comparação em tempo constante: `===` vazaria o tamanho do prefixo correto.
    return crypto.timingSafeEqual(derivado, esperado);
  } catch {
    return false;
  }
}

/** Regras mínimas. Comprimento vale mais que exigir símbolo — e irrita menos. */
export function senhaFraca(senha: string): string | null {
  if (senha.length < 10) return 'A senha precisa de pelo menos 10 caracteres.';
  if (senha.length > 200) return 'Senha longa demais.';
  if (/^\d+$/.test(senha)) return 'Uma senha só de números é fácil de adivinhar.';
  return null;
}

// ------------------------------------------------------------------ tokens

/** Token aleatório, seguro para URL. 32 bytes = 256 bits. */
export function novoToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ----------------------------------------------------------------- sessões

/** Trinta dias. Longo o bastante para não irritar, curto para limitar estrago. */
export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

export interface DadosSessao {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** Cria a sessão e devolve o token EM CLARO — a única vez que ele existe. */
export async function criarSessao(userId: string, dados: DadosSessao = {}): Promise<string> {
  const token = novoToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: dados.userAgent?.slice(0, 300) ?? null,
    ipAddress: dados.ipAddress ?? null,
    expiresAt: new Date(Date.now() + DURACAO_SESSAO_MS),
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  return token;
}

export interface Autenticado {
  userId: string;
  sessionId: string;
}

/** Valida o token do cookie. `null` quando ausente, expirado ou revogado. */
export async function validarSessao(
  token: string | null | undefined,
  dados?: DadosSessao
): Promise<Autenticado | null> {
  if (!token) return null;

  const linhas = await db
    .select({ id: sessions.id, userId: sessions.userId, ipAddress: sessions.ipAddress, userAgent: sessions.userAgent })
    .from(sessions)
    .where(and(
      eq(sessions.tokenHash, hashToken(token)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ))
    .limit(1);

  const s = linhas[0];
  if (!s) return null;

  // `lastSeenAt` alimenta a lista de dispositivos.
  // Atualiza IP e UserAgent caso estejam nulos ou tenham sido fornecidos.
  const updates: Record<string, unknown> = { lastSeenAt: new Date() };
  if (dados?.ipAddress && (!s.ipAddress || s.ipAddress !== dados.ipAddress)) {
    updates.ipAddress = dados.ipAddress;
  }
  if (dados?.userAgent && (!s.userAgent || s.userAgent !== dados.userAgent)) {
    updates.userAgent = dados.userAgent.slice(0, 300);
  }

  void db.update(sessions).set(updates).where(eq(sessions.id, s.id));

  return { userId: s.userId, sessionId: s.id };
}

export async function revogarSessao(token: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Encerra todas as sessões — usado ao trocar senha e ao pedir exclusão. */
export async function revogarTodasSessoes(userId: string, exceto?: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(sessions.userId, userId),
      isNull(sessions.revokedAt),
      ...(exceto ? [sql`${sessions.id} <> ${exceto}`] : []),
    ));
}

/** Remove sessões vencidas. Chamado por um job, não a cada request. */
export async function limparSessoesVencidas(): Promise<number> {
  const apagadas = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return apagadas.length;
}

// ------------------------------------------------------ tokens de e-mail

export type PropositoToken = 'magic_link' | 'verify_email' | 'password_reset';

const VALIDADE: Record<PropositoToken, number> = {
  // Link mágico é credencial de acesso: quanto menor a janela, melhor.
  magic_link: 15 * 60 * 1000,
  // Confirmação de e-mail não dá acesso; pode esperar a pessoa ver a caixa.
  verify_email: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

/** Emite um token e invalida os anteriores do mesmo propósito. */
export async function emitirTokenEmail(userId: string, purpose: PropositoToken): Promise<string> {
  // Pedir um novo link derruba o antigo. Senão, todo link já enviado continua
  // valendo, e a janela de exposição vira a soma de todas as tentativas.
  await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)));

  const token = novoToken();
  await db.insert(emailTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VALIDADE[purpose]),
  });
  return token;
}

/** Consome o token. Devolve o dono, ou `null` se inválido, vencido ou já usado. */
export async function consumirTokenEmail(token: string, purpose: PropositoToken): Promise<string | null> {
  const linhas = await db
    .select({ id: emailTokens.id, userId: emailTokens.userId })
    .from(emailTokens)
    .where(and(
      eq(emailTokens.tokenHash, hashToken(token)),
      eq(emailTokens.purpose, purpose),
      isNull(emailTokens.usedAt),
      gt(emailTokens.expiresAt, new Date()),
    ))
    .limit(1);

  const t = linhas[0];
  if (!t) return null;

  // Marca como usado condicionando a `usedAt IS NULL`: dois cliques simultâneos
  // no mesmo link não podem gerar duas sessões.
  const marcados = await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.id, t.id), isNull(emailTokens.usedAt)))
    .returning({ id: emailTokens.id });

  return marcados.length > 0 ? t.userId : null;
}

// -------------------------------------------------------- limite de taxa

export interface Limite {
  /** Tentativas permitidas na janela. */
  max: number;
  /** Tamanho da janela, em milissegundos. */
  janelaMs: number;
  /** Quanto tempo fica bloqueado depois de estourar. */
  bloqueioMs: number;
}

export const LIMITES = {
  /** Senha errada é barata para quem ataca e cara para quem esquece a senha. */
  login: { max: 8, janelaMs: 15 * 60_000, bloqueioMs: 15 * 60_000 },
  /** Cada envio custa dinheiro e enche a caixa de outra pessoa. */
  email: { max: 5, janelaMs: 60 * 60_000, bloqueioMs: 60 * 60_000 },
  /** Cadastro em massa. */
  registro: { max: 5, janelaMs: 60 * 60_000, bloqueioMs: 60 * 60_000 },
} as const satisfies Record<string, Limite>;

export interface ResultadoLimite {
  permitido: boolean;
  /** Segundos até poder tentar de novo. `0` quando permitido. */
  esperarSegundos: number;
  restantes: number;
}

/**
 * Conta uma tentativa e diz se pode seguir.
 *
 * Janela fixa, no banco. Um contador em memória zeraria a cada reinício e não
 * valeria nada com mais de uma instância — que é justamente quando importa.
 */
export async function registrarTentativa(chave: string, limite: Limite): Promise<ResultadoLimite> {
  const agora = new Date();

  const atual = (await db.select().from(rateLimits).where(eq(rateLimits.key, chave)).limit(1))[0];

  if (atual?.blockedUntil && atual.blockedUntil > agora) {
    return {
      permitido: false,
      esperarSegundos: Math.ceil((atual.blockedUntil.getTime() - agora.getTime()) / 1000),
      restantes: 0,
    };
  }

  const janelaVenceu = !atual || agora.getTime() - atual.windowStart.getTime() > limite.janelaMs;

  if (janelaVenceu) {
    await db
      .insert(rateLimits)
      .values({ key: chave, count: 1, windowStart: agora, blockedUntil: null })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: 1, windowStart: agora, blockedUntil: null },
      });
    return { permitido: true, esperarSegundos: 0, restantes: limite.max - 1 };
  }

  const novoTotal = atual.count + 1;
  const estourou = novoTotal > limite.max;

  await db
    .update(rateLimits)
    .set({
      count: novoTotal,
      blockedUntil: estourou ? new Date(agora.getTime() + limite.bloqueioMs) : null,
    })
    .where(eq(rateLimits.key, chave));

  return estourou
    ? { permitido: false, esperarSegundos: Math.ceil(limite.bloqueioMs / 1000), restantes: 0 }
    : { permitido: true, esperarSegundos: 0, restantes: limite.max - novoTotal };
}

/** Zera o contador. Chamado no acerto, para quem lembrou a senha não ficar preso. */
export async function limparTentativas(chave: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, chave));
}
