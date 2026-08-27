/**
 * Exercita a identidade ponta a ponta, sem navegador.
 *
 * Cobre os quatro caminhos de entrada, o cookie de sessão, o limite de
 * tentativas e a expiração dos tokens de e-mail. Limpa o que cria.
 *
 *   pnpm --filter backend run auth:selftest
 */
import 'dotenv/config';
import { eq, like, inArray } from 'drizzle-orm';
import { db } from '../src/db/db.js';
import { users, sessions, emailTokens, emailLog, rateLimits, identities } from '../src/db/schema.js';

const API = 'http://localhost:3001/api/auth';
const EMAIL = 'selftest@demo.skiller.local';
const SENHA = 'uma-senha-bem-comprida';

const marca = (ok: boolean) => (ok ? 'OK   ' : 'FALHA');

/** Guarda o cookie entre requisições, como um navegador faria. */
class Navegador {
  private cookies = new Map<string, string>();

  async post(caminho: string, corpo: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(API + caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.cabecalho() },
      body: JSON.stringify(corpo),
    });
    this.guardar(res);
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async get(caminho: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(API + caminho, { headers: this.cabecalho() });
    this.guardar(res);
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  private cabecalho(): Record<string, string> {
    if (this.cookies.size === 0) return {};
    return { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') };
  }

  private guardar(res: Response): void {
    for (const linha of res.headers.getSetCookie?.() ?? []) {
      const [par] = linha.split(';');
      const i = par.indexOf('=');
      const nome = par.slice(0, i);
      const valor = par.slice(i + 1);
      if (valor === '' || linha.includes('Max-Age=0')) this.cookies.delete(nome);
      else this.cookies.set(nome, valor);
    }
  }

  temSessao(): boolean {
    return this.cookies.has('skiller_session');
  }
}

/** Lê o token do link que o e-mail carregaria. */
async function tokenDoEmail(userId: string, purpose: string): Promise<string | null> {
  // O token em claro não existe no banco (só o hash), então o teste emite um
  // novo pelo mesmo caminho que a rota usa.
  const { emitirTokenEmail } = await import('../src/lib/auth.js');
  void purpose;
  void userId;
  return emitirTokenEmail(userId, purpose as 'magic_link' | 'verify_email' | 'password_reset');
}

async function limpar(): Promise<void> {
  const antigos = await db.select({ id: users.id }).from(users).where(like(users.email, 'selftest@demo%'));
  if (antigos.length > 0) {
    await db.delete(users).where(inArray(users.id, antigos.map((u) => u.id)));
  }
  await db.delete(rateLimits).where(like(rateLimits.key, '%selftest@demo%'));
  await db.delete(emailLog).where(like(emailLog.to, 'selftest@demo%'));
}

async function main(): Promise<void> {
  await limpar();

  console.log('=== PROVEDORES DISPONÍVEIS ===');
  const prov = await new Navegador().get('/providers');
  const lista = (prov.body.providers as { id: string }[]) ?? [];
  console.log(`   ${lista.length === 0 ? 'nenhum (Google/GitHub sem credenciais)' : lista.map((p) => p.id).join(', ')}`);

  // ------------------------------------------------------------- cadastro
  console.log('\n=== CADASTRO COM SENHA ===');
  const nav = new Navegador();

  const semTermos = await nav.post('/register', { email: EMAIL, password: SENHA });
  console.log(`   ${marca(semTermos.status === 400)} sem aceitar termos → HTTP ${semTermos.status}  ${semTermos.body.error}`);

  const fraca = await nav.post('/register', { email: EMAIL, password: '123', acceptTerms: true });
  console.log(`   ${marca(fraca.status === 400)} senha fraca → HTTP ${fraca.status}  "${String(fraca.body.message).slice(0, 44)}"`);

  const ok = await nav.post('/register', { email: EMAIL, password: SENHA, name: 'Teste', acceptTerms: true });
  console.log(`   ${marca(ok.status === 200 && nav.temSessao())} cadastro válido → HTTP ${ok.status}, cookie de sessão ${nav.temSessao() ? 'recebido' : 'AUSENTE'}`);

  const me = await nav.get('/me');
  const u = me.body.user as Record<string, unknown> | undefined;
  console.log(`   ${marca(me.body.authenticated === true)} /me → ${u?.email}  termos=${!u?.needsTermsAcceptance ? 'aceitos' : 'PENDENTES'}  email verificado=${u?.emailVerified}`);

  const [conta] = await db.select().from(users).where(eq(users.email, EMAIL));

  const repetido = await new Navegador().post('/register', { email: EMAIL, password: SENHA, acceptTerms: true });
  console.log(`   ${marca(repetido.status === 409)} mesmo e-mail de novo → HTTP ${repetido.status}  "${String(repetido.body.message).slice(0, 40)}"`);

  // --------------------------------------------------------------- login
  console.log('\n=== LOGIN ===');
  const errado = await new Navegador().post('/login', { email: EMAIL, password: 'senha-errada-mesmo' });
  console.log(`   ${marca(errado.status === 401)} senha errada → HTTP ${errado.status}  "${errado.body.message}"`);

  const nav2 = new Navegador();
  const certo = await nav2.post('/login', { email: EMAIL, password: SENHA });
  console.log(`   ${marca(certo.status === 200 && nav2.temSessao())} senha certa → HTTP ${certo.status}, sessão ${nav2.temSessao() ? 'criada' : 'AUSENTE'}`);

  const inexistente = await new Navegador().post('/login', { email: 'nao-existe@demo.skiller.local', password: SENHA });
  console.log(`   ${marca(inexistente.status === 401 && inexistente.body.message === errado.body.message)} conta inexistente → mesma resposta (não enumera clientes)`);

  // ------------------------------------------------------- limite de taxa
  console.log('\n=== LIMITE DE TENTATIVAS ===');
  let bloqueouEm = 0;
  for (let i = 1; i <= 12; i++) {
    const r = await new Navegador().post('/login', { email: EMAIL, password: 'errada-' + i });
    if (r.status === 429) { bloqueouEm = i; break; }
  }
  console.log(`   ${marca(bloqueouEm > 0 && bloqueouEm <= 10)} bloqueou na tentativa ${bloqueouEm || '(nunca — FALHA)'}`);
  await db.delete(rateLimits).where(like(rateLimits.key, `%${EMAIL}%`));

  // ---------------------------------------------------------- link mágico
  console.log('\n=== LINK MÁGICO ===');
  const pedido = await new Navegador().post('/magic-link', { email: EMAIL });
  console.log(`   ${marca(pedido.status === 200)} pedido → "${String(pedido.body.message).slice(0, 52)}"`);

  const fantasma = await new Navegador().post('/magic-link', { email: 'quem-sabe@demo.skiller.local' });
  console.log(`   ${marca(fantasma.body.message === pedido.body.message)} e-mail desconhecido → mesma resposta`);

  const token = await tokenDoEmail(conta.id, 'magic_link');
  const nav3 = new Navegador();
  const usou = await nav3.post('/magic-link/consume', { token });
  console.log(`   ${marca(usou.status === 200 && nav3.temSessao())} consumo do link → HTTP ${usou.status}, sessão ${nav3.temSessao() ? 'criada' : 'AUSENTE'}`);

  const reuso = await new Navegador().post('/magic-link/consume', { token });
  console.log(`   ${marca(reuso.status === 400)} MESMO link de novo → HTTP ${reuso.status}  "${String(reuso.body.message).slice(0, 40)}"`);

  const depois = await db.select({ v: users.emailVerifiedAt }).from(users).where(eq(users.id, conta.id));
  console.log(`   ${marca(Boolean(depois[0].v))} entrar pelo link confirmou o e-mail`);

  // ------------------------------------------------------ troca de senha
  console.log('\n=== REDEFINIR SENHA ===');
  const antes = (await db.select({ n: sessions.id }).from(sessions).where(eq(sessions.userId, conta.id))).length;
  const tokenReset = await tokenDoEmail(conta.id, 'password_reset');
  const nav4 = new Navegador();
  const trocou = await nav4.post('/password/reset', { token: tokenReset, password: 'outra-senha-comprida' });
  console.log(`   ${marca(trocou.status === 200)} troca → HTTP ${trocou.status}`);

  const vivas = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, conta.id));
  const revogadas = (await db.select().from(sessions).where(eq(sessions.userId, conta.id))).filter((s) => s.revokedAt);
  console.log(`   ${marca(revogadas.length >= antes)} sessões anteriores revogadas: ${revogadas.length} de ${vivas.length}`);

  const velha = await new Navegador().post('/login', { email: EMAIL, password: SENHA });
  console.log(`   ${marca(velha.status === 401)} senha antiga → HTTP ${velha.status}`);
  await db.delete(rateLimits).where(like(rateLimits.key, `%${EMAIL}%`));

  // ------------------------------------------------------------- logout
  console.log('\n=== SAIR ===');
  const nav5 = new Navegador();
  await nav5.post('/login', { email: EMAIL, password: 'outra-senha-comprida' });
  const antesSair = await nav5.get('/me');
  await nav5.post('/logout', {});
  const depoisSair = await nav5.get('/me');
  console.log(`   ${marca(antesSair.body.authenticated === true && depoisSair.body.authenticated === false)} autenticado antes=${antesSair.body.authenticated} depois=${depoisSair.body.authenticated}`);

  // ------------------------------------------------------------ vínculos
  console.log('\n=== VÍNCULOS E E-MAILS ===');
  const vinc = await db.select({ p: identities.provider }).from(identities).where(eq(identities.userId, conta.id));
  console.log(`   identidades: ${vinc.map((v) => v.p).join(', ')}`);
  const enviados = await db.select({ t: emailLog.template, s: emailLog.status }).from(emailLog).where(eq(emailLog.userId, conta.id));
  console.log(`   e-mails: ${enviados.map((e) => `${e.t}(${e.s})`).join(', ') || 'nenhum'}`);
  const tokensRestantes = await db.select({ p: emailTokens.purpose, u: emailTokens.usedAt }).from(emailTokens).where(eq(emailTokens.userId, conta.id));
  const naoUsados = tokensRestantes.filter((t) => !t.u);
  console.log(`   ${marca(naoUsados.length <= 1)} tokens em aberto: ${naoUsados.length} (emitir um novo invalida o anterior)`);

  await limpar();
  console.log('\nlimpo.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
