/**
 * Testa o conector MCP como um cliente de verdade faria.
 *
 * Cobre o caminho inteiro: a IDE pede um código, a pessoa autoriza no painel,
 * a IDE troca o código por token, abre sessão MCP e chama tools. Mais o que
 * NÃO pode acontecer — token de outra conta enxergar skill alheia, cliente sem
 * token listar qualquer coisa, plano sem direito passar pelo portão.
 *
 *   pnpm --filter backend run connector:selftest
 */
import 'dotenv/config';
import { eq, like, inArray } from 'drizzle-orm';
import { db } from '../src/db/db.js';
import { users, mcpDevices, skills } from '../src/db/schema.js';

// Aceita apontar para o tunel, para provar o conector pelo endereco publico:
//   TESTE_API=https://xxx.ngrok-free.dev pnpm --filter backend run connector:selftest
const API = process.env.TESTE_API ?? 'http://localhost:3001';
const MCP = `${API}/api/mcp/`;

const marca = (ok: boolean) => (ok ? 'OK   ' : 'FALHA');

/** Um cliente MCP: mantém a sessão e fala JSON-RPC, como Claude Desktop faria. */
class ClienteMcp {
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
    try { return JSON.parse(linha.replace(/^data:\s*/, '')); } catch { return { raw: txt.slice(0, 90) }; }
  }

  async conectar(): Promise<string> {
    const r = await this.rpc('initialize', {
      protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'teste-conector', version: '1.0' },
    }, 0);
    return this.sid || (r.raw ? '' : '');
  }

  async tools(): Promise<string[]> {
    const r = await this.rpc('tools/list', {}, 1);
    return (r.result?.tools ?? []).map((t: { name: string }) => t.name);
  }

  async chamar(nome: string, args: unknown = {}): Promise<string> {
    const r = await this.rpc('tools/call', { name: nome, arguments: args }, 2);
    return (r.result?.content?.[0]?.text ?? r.error?.message ?? '(vazio)').split('\n')[0];
  }
}

interface Conta { id: string; plan: string; email: string }

/** O fluxo que a IDE faz: pede código, humano autoriza, troca por token. */
async function parear(conta: Conta): Promise<{ token: string | null; passos: string[] }> {
  const passos: string[] = [];

  const cod = await (await fetch(`${API}/api/oauth/device/code`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })).json();
  passos.push(`código ${cod.user_code} · abrir ${String(cod.verification_uri).replace('http://localhost:3000', '')}`);

  const ver = await fetch(`${API}/api/oauth/device/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCode: cod.user_code, userId: conta.id }),
  });
  const corpoVer = await ver.json();
  passos.push(`autorizar → HTTP ${ver.status}${ver.ok ? '' : ' · ' + (corpoVer.message ?? corpoVer.error)}`);
  if (!ver.ok) return { token: null, passos };

  // Form-urlencoded, como manda o spec do device flow.
  const tk = await fetch(`${API}/api/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: cod.device_code,
    }).toString(),
  });
  const corpoTk = await tk.json();
  passos.push(`trocar por token → ${corpoTk.access_token ? corpoTk.access_token.slice(0, 12) + '…' : JSON.stringify(corpoTk).slice(0, 50)}`);

  return { token: corpoTk.access_token ?? null, passos };
}

async function main(): Promise<void> {
  const linhas = await db
    .select({ id: users.id, plan: users.plan, email: users.email })
    .from(users)
    .where(like(users.email, '%@demo.skiller.local'));

  const acha = (p: string) => {
    const c = linhas.find((l) => l.plan === p);
    if (!c) { console.error(`conta de demo "${p}" ausente — rode: pnpm --filter backend run seed`); process.exit(1); }
    return c;
  };
  const free = acha('free'), starter = acha('starter'), pro = acha('pro');

  // Uma skill de cada conta, para provar o isolamento.
  const sondas: string[] = [];
  for (const [dono, rot] of [[free.id, 'free'], [pro.id, 'pro']] as const) {
    const [s] = await db.insert(skills).values({
      userId: dono, name: `conector-${rot}`, playlistUrl: 'https://example.invalid/c',
      status: 'completed', skillMdContent: `CONTEUDO PRIVADO DO ${rot.toUpperCase()}`,
      skillPackage: { name: `conector_${rot}`, description: `skill privada do ${rot}` },
    }).returning();
    sondas.push(s.id);
  }

  console.log('╭─ PAREAMENTO ' + '─'.repeat(56));

  const tokens: Record<string, string | null> = {};
  for (const c of [free, starter, pro]) {
    const { token, passos } = await parear(c);
    tokens[c.plan] = token;
    console.log(`│ ${c.plan.toUpperCase()}`);
    for (const p of passos) console.log(`│   ${p}`);
    const esperado = c.plan === 'free' ? token === null : token !== null;
    console.log(`│   ${marca(esperado)} ${c.plan === 'free' ? 'Free não pode plugar IDE (conector é do Starter)' : 'pareado'}`);
  }
  console.log('╰' + '─'.repeat(69) + '\n');

  console.log('╭─ USO DO CONECTOR ' + '─'.repeat(51));

  for (const [rot, token] of [
    ['pro', tokens.pro],
    ['starter', tokens.starter],
    ['anônimo', null],
  ] as [string, string | null][]) {
    const cli = new ClienteMcp(token);
    const sid = await cli.conectar();
    const nomes = await cli.tools();

    const propriaDoPro = nomes.includes('conector_pro');
    const alheia = rot === 'pro' ? nomes.includes('conector_free') : nomes.includes('conector_pro');
    const leitura = await cli.chamar('conector_pro');
    const vazou = leitura.includes('CONTEUDO PRIVADO') && rot !== 'pro';

    const ok = sid.length > 0 && !alheia && !vazou && (rot !== 'pro' || propriaDoPro);
    console.log(`│ ${marca(ok)} ${rot.padEnd(9)} sessão=${sid ? 'abriu' : 'FALHOU'}  ${String(nomes.length).padStart(2)} tools`);
    console.log(`│           skill de outra conta: ${alheia ? 'VISÍVEL (!!)' : 'oculta'}`);
    console.log(`│           ao chamar: "${leitura.slice(0, 46)}"`);
  }
  console.log('╰' + '─'.repeat(69) + '\n');

  console.log('╭─ BASE DA IA (entregável do Pro) ' + '─'.repeat(36));
  for (const [rot, token] of [['starter', tokens.starter], ['pro', tokens.pro]] as [string, string | null][]) {
    const cli = new ClienteMcp(token);
    await cli.conectar();
    const r = await cli.chamar('kb_query', { question: 'como o idioma da transcrição é escolhido?' });
    const bloqueado = r.startsWith('Este recurso faz parte');
    const esperado = rot === 'pro' ? !bloqueado : bloqueado;
    console.log(`│ ${marca(esperado)} ${rot.padEnd(9)} ${bloqueado ? 'bloqueado' : 'liberado '}  ${r.slice(0, 48)}`);
  }
  console.log('╰' + '─'.repeat(69) + '\n');

  console.log('╭─ REVOGAÇÃO ' + '─'.repeat(57));
  if (tokens.pro) {
    // `expired` é o status de saída que a tabela aceita — a constraint só
    // permite pending/authorized/expired.
    await db
      .update(mcpDevices)
      .set({ status: 'expired' })
      .where(eq(mcpDevices.accessToken, tokens.pro));
    const cli = new ClienteMcp(tokens.pro);
    await cli.conectar();
    const depois = await cli.tools();
    console.log(`│ ${marca(depois.length <= 5)} token revogado → ${depois.length} tools (só as da Base, que explicam o que fazer)`);
  }
  console.log('╰' + '─'.repeat(69));

  // limpeza
  await db.delete(skills).where(inArray(skills.id, sondas));
  const usados = Object.values(tokens).filter(Boolean) as string[];
  if (usados.length) await db.delete(mcpDevices).where(inArray(mcpDevices.accessToken, usados));
  console.log('\nlimpo.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
