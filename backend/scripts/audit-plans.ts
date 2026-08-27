/**
 * Auditoria da separação por plano — prova por execução.
 *
 * Cobre cada capacidade de `plans.ts` e diz onde ela é aplicada de verdade.
 * Exige o servidor de pé e o seed rodado.
 *
 *   pnpm --filter backend run audit:plans
 */
import 'dotenv/config';
import { eq, like, inArray } from 'drizzle-orm';
import { db } from '../src/db/db.js';
import { users, mcpDevices, skills } from '../src/db/schema.js';
import { PLAN_SPEC, PLANS, type Capability } from '../src/lib/plans.js';

const API = 'http://localhost:3001';
const MCP = `${API}/api/mcp/`;

interface Conta { id: string; plan: string; token: string | null }

// --------------------------------------------------------------------- MCP

/** Uma sessão MCP isolada. Cada chamada abre a sua, como um cliente faria. */
class Sessao {
  private sid = '';
  constructor(private token: string | null) {}

  private async rpc(method: string, params: unknown, id: number) {
    const res = await fetch(MCP, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(this.sid ? { 'mcp-session-id': this.sid } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    if (!this.sid) this.sid = res.headers.get('mcp-session-id') ?? '';
    const txt = await res.text();
    const linha = txt.split('\n').find((l) => l.startsWith('data:')) ?? txt;
    try { return JSON.parse(linha.replace(/^data:\s*/, '')); } catch { return { raw: txt.slice(0, 100) }; }
  }

  async abrir() {
    await this.rpc('initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'auditoria', version: '1' },
    }, 0);
    return this.sid;
  }

  async tools(): Promise<string[]> {
    const r = await this.rpc('tools/list', {}, 1);
    return (r.result?.tools ?? []).map((t: { name: string }) => t.name);
  }

  async chamar(nome: string, args: unknown = {}): Promise<string> {
    const r = await this.rpc('tools/call', { name: nome, arguments: args }, 2);
    return (r.result?.content?.[0]?.text ?? r.error?.message ?? '(vazio)').replace(/\n[\s\S]*/, '');
  }
}

const BLOQUEIO = 'Este recurso faz parte';
const SEM_CONTA = 'Sua conta Skiller não está conectada';
const marca = (ok: boolean) => (ok ? 'OK  ' : 'FALHA');

async function main(): Promise<void> {
  const linhas = await db
    .select({ id: users.id, plan: users.plan, token: mcpDevices.accessToken })
    .from(users)
    .leftJoin(mcpDevices, eq(mcpDevices.userId, users.id))
    .where(like(users.email, '%@demo.skiller.local'));

  const conta = (p: string): Conta => {
    const c = linhas.find((l) => l.plan === p);
    if (!c) { console.error(`conta de demo "${p}" ausente. Rode: pnpm --filter backend run seed`); process.exit(1); }
    return c;
  };
  const free = conta('free'), starter = conta('starter'), pro = conta('pro');

  console.log('┌─ matriz de capacidades ' + '─'.repeat(46));
  const caps: Capability[] = ['skill.generate', 'skill.test', 'skill.export', 'skill.edit', 'connectors.mcp', 'kb', 'projects.shared'];
  console.log('│ ' + 'capacidade'.padEnd(17) + PLANS.map((p) => p.slice(0, 5).padEnd(7)).join(''));
  for (const cap of caps) {
    console.log('│ ' + cap.padEnd(17) + PLANS.map((p) => (PLAN_SPEC[p].capabilities.includes(cap) ? 'sim' : '—').padEnd(7)).join(''));
  }
  console.log('└' + '─'.repeat(69) + '\n');

  // ---------------------------------------------------------------- conta nova
  console.log('A. CONTA RECÉM-CRIADA (não pagou nada)');
  const [novo] = await db.insert(users).values({ email: 'auditoria-novato@demo.skiller.local' }).returning();
  const okNovo = novo.plan === 'free';
  console.log(`   ${marca(okNovo)} nasce em "${novo.plan}" com ${novo.creditsBalance} créditos ` +
    `(esperado: free / ${PLAN_SPEC.free.monthlyCredits})`);
  await db.delete(users).where(eq(users.id, novo.id));

  // ------------------------------------------------------------------- kb (Pro)
  console.log('\nB. BASE DA IA — entregável do Pro');
  for (const c of [free, starter, pro]) {
    const s = new Sessao(c.token);
    await s.abrir();
    const r = await s.chamar('kb_query', { question: 'transcrição' });
    const bloqueado = r.startsWith(BLOQUEIO);
    const esperado = c.plan === 'pro' ? !bloqueado : bloqueado;
    console.log(`   ${marca(esperado)} ${c.plan.padEnd(8)} ${bloqueado ? 'bloqueado' : 'liberado '}  ${r.slice(0, 52)}`);
  }

  // ------------------------------------------------- conector + isolamento MCP
  console.log('\nC. CONECTOR MCP — entregável do Starter, e isolamento entre contas');
  const sondas: string[] = [];
  for (const [dono, rot] of [[free.id, 'free'], [pro.id, 'pro']] as const) {
    const [s] = await db.insert(skills).values({
      userId: dono, name: `auditoria-${rot}`, playlistUrl: 'https://example.invalid/a',
      status: 'completed', skillMdContent: `SEGREDO DA CONTA ${rot.toUpperCase()}`,
      skillPackage: { name: `auditoria_${rot}`, description: `privada do ${rot}` },
    }).returning();
    sondas.push(s.id);
  }

  for (const [rotulo, tk, esperaVer] of [
    ['pro', pro.token, true], ['free', free.token, false], ['anônimo', null, false],
  ] as [string, string | null, boolean][]) {
    const s = new Sessao(tk);
    const sid = await s.abrir();
    const nomes = await s.tools();
    const propria = nomes.includes('auditoria_pro');
    const alheia = nomes.includes(rotulo === 'pro' ? 'auditoria_free' : 'auditoria_pro');
    const leitura = await s.chamar('auditoria_pro');
    const vazou = leitura.includes('SEGREDO') && rotulo !== 'pro';
    const ok = sid.length > 0 && propria === esperaVer && !alheia && !vazou;
    console.log(`   ${marca(ok)} ${rotulo.padEnd(8)} sessão=${sid ? 'abriu' : 'FALHOU'}  ${String(nomes.length).padStart(2)} tools  ` +
      `skill alheia=${alheia ? 'VISÍVEL(!!)' : 'oculta'}  leitura="${leitura.slice(0, 34)}"`);
  }
  await db.delete(skills).where(inArray(skills.id, sondas));

  // --------------------------------------------------------------- skill.edit
  console.log('\nD. EDIÇÃO DE SKILL — entregável do Starter');
  const editaveis: { plan: string; id: string }[] = [];
  for (const c of [free, starter, pro]) {
    const [s] = await db.insert(skills).values({
      userId: c.id, name: `auditoria-edit-${c.plan}`, playlistUrl: 'https://example.invalid/e',
      status: 'completed', skillPackage: { root: { name: 'r' }, blobs: { 'SKILL.md': { content: '# antes' } } },
    }).returning();
    editaveis.push({ plan: c.plan, id: s.id });
  }
  for (const e of editaveis) {
    const r = await fetch(`${API}/api/skills/${e.id}/file`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'SKILL.md', content: '# depois' }),
    });
    const esperado = e.plan === 'free' ? r.status === 402 : r.status === 200;
    console.log(`   ${marca(esperado)} ${e.plan.padEnd(8)} PATCH /file → HTTP ${r.status}`);
  }
  await db.delete(skills).where(inArray(skills.id, editaveis.map((e) => e.id)));

  // ------------------------------------------------------------ autorização MCP
  console.log('\nE. AUTORIZAÇÃO DE DISPOSITIVO — quem pode plugar uma IDE');
  for (const c of [free, starter]) {
    const cod = await (await fetch(`${API}/api/oauth/device/code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })).json();
    const r = await fetch(`${API}/api/oauth/device/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode: cod.user_code, userId: c.id }),
    });
    const esperado = c.plan === 'free' ? r.status === 402 : r.status === 200;
    console.log(`   ${marca(esperado)} ${c.plan.padEnd(8)} device/verify → HTTP ${r.status}`);
  }
  const semUser = await fetch(`${API}/api/oauth/device/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userCode: 'XXXX' }),
  });
  console.log(`   ${marca(semUser.status === 400)} sem userId  → HTTP ${semUser.status} (antes emitia token para o 1º usuário da tabela)`);

  // ------------------------------------------------------- token sem conta válida
  console.log('\nF. TOKEN INVÁLIDO');
  const s = new Sessao('token-que-nao-existe');
  await s.abrir();
  const r = await s.chamar('kb_query', { question: 'x' });
  console.log(`   ${marca(r.startsWith(SEM_CONTA))} recusado: "${r.slice(0, 58)}"`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
