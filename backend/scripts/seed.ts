/**
 * Seed de demonstração — uma conta por plano.
 *
 * Existe para tornar a diferença entre os planos visível sem clicar em nada:
 * a mesma tool MCP chamada por contas diferentes responde diferente, e o painel
 * mostra o quê depende de quem está logado.
 *
 * Idempotente: reidentifica as contas pelo e-mail e recria os dados.
 * Só toca em e-mails `@demo.skiller.local` — não encosta em dado real.
 *
 *   pnpm --filter backend run seed
 */
import 'dotenv/config';
import crypto from 'crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '../src/db/db.js';
import { users, mcpDevices, kbPages, kbLog } from '../src/db/schema.js';
import { PLAN_SPEC, type Plan } from '../src/lib/plans.js';
import { runWithMcpContext } from '../src/lib/mcp-context.js';
import { handleKbTool } from '../src/lib/kb-tools.js';
import { CANVAS_PATH, type Canvas } from '../src/lib/kb.js';

const DOMINIO = '@demo.skiller.local';

const CONTAS: { plan: Plan; nome: string }[] = [
  { plan: 'free', nome: 'Demo Free' },
  { plan: 'starter', nome: 'Demo Starter' },
  { plan: 'pro', nome: 'Demo Pro' },
  { plan: 'enterprise', nome: 'Demo Enterprise' },
];

/** Conteúdo da Base do usuário Pro — o único plano que a destrava. */
const PAGINAS = [
  {
    title: 'Fila de síntese com BullMQ',
    type: 'architecture',
    tags: ['bullmq', 'redis', 'worker'],
    canal: 'claude-desktop',
    body: [
      '## Resumo',
      'O pipeline roda fora da request HTTP, num worker BullMQ apoiado em Redis.',
      '',
      '## Detalhes',
      'A concorrência vem de `WORKER_CONCURRENCY`, com default 4. Cada vídeo faz',
      'duas chamadas de rede — transcrição e LLM — então serializar estoura a meta',
      'de 5 minutos numa playlist de 50.',
      '',
      '## Learnings',
      '🟡 HIPÓTESE: acima de 8 em paralelo o YouTube começa a responder 429.',
    ].join('\n'),
  },
  {
    title: 'Transcrição escolhia o idioma errado',
    type: 'decision',
    tags: ['youtube', 'transcricao'],
    canal: 'claude-desktop',
    body: [
      '## Resumo',
      'Sem `lang`, a biblioteca pegava a track padrão do YouTube — que em vídeo com',
      'legenda traduzida automática costuma vir num idioma arbitrário.',
      '',
      '## Decisões Tomadas',
      'Sondar os idiomas disponíveis e preferir a track original quando ela já for',
      'processável. Só então cair na ordem de preferência. Preferir `pt` cegamente',
      'entregaria tradução de máquina num vídeo falado em inglês, com perda nos',
      'termos técnicos.',
      '',
      '## Learnings',
      'A lib não expõe a lista de idiomas, mas o erro de idioma inválido traz',
      '`Available languages: ...` — é a única via de descoberta sem outra dependência.',
    ].join('\n'),
  },
  {
    title: 'Evolution API para WhatsApp',
    type: 'integration',
    tags: ['whatsapp', 'evolution'],
    canal: 'cursor',
    body: [
      '## Resumo',
      'Uma instância por cliente; o webhook aponta para `API_URL`.',
      '',
      '## Learnings',
      'O webhook exige URL pública. Em desenvolvimento, túnel — senão a Evolution',
      'aceita o registro e nunca entrega evento.',
    ].join('\n'),
  },
  {
    title: 'Base da IA nasce do contrato Karpathy',
    type: 'feature',
    tags: ['kb', 'mcp', 'karpathy'],
    canal: 'claude-desktop',
    body: [
      '## Resumo',
      'A wiki online segue o mesmo contrato do cofre local: arquivo vira linha, e o',
      'markdown continua sendo a fonte da verdade, frontmatter incluído.',
      '',
      '## Decisões Tomadas',
      'As 5 operações viram tools MCP. Nada de `write` genérico — ele deixaria o',
      'agente pular índice, log e canvas, que é justamente o que as 11 regras exigem',
      'manter em sincronia.',
      '',
      '## Relacionados',
      '- [Fila de síntese com BullMQ](architecture/fila-de-sintese-com-bullmq.md) — mesmo worker',
    ].join('\n'),
  },
];

async function limpar(): Promise<void> {
  const antigos = await db.select({ id: users.id }).from(users).where(like(users.email, `%${DOMINIO}`));
  if (antigos.length === 0) return;
  // O cascade das FKs leva mcp_devices, kb_pages e kb_log junto.
  await db.delete(users).where(inArray(users.id, antigos.map((u) => u.id)));
  console.log(`limpou ${antigos.length} conta(s) de demo anteriores`);
}

/**
 * Espalha os nós do canvas por três datas passadas.
 *
 * Só para a demo: como o seed roda tudo num instante, a linha do tempo nasceria
 * com um único ponto e a feature não apareceria. No uso real as datas vêm do dia
 * em que cada página foi escrita.
 */
async function espalharCanvas(userId: string): Promise<void> {
  const rows = await db
    .select({ content: kbPages.content })
    .from(kbPages)
    .where(and(eq(kbPages.userId, userId), eq(kbPages.path, CANVAS_PATH)));

  const canvasRow = rows[0];
  if (!canvasRow) return;

  const canvas = JSON.parse(canvasRow.content) as Canvas;
  const arquivos = canvas.nodes.filter((n) => n.type === 'file');
  if (arquivos.length < 2) return;

  const hoje = new Date();
  const datas = [6, 3, 0].map((d) => {
    const x = new Date(hoje);
    x.setDate(x.getDate() - d);
    return x.toISOString().slice(0, 10);
  });

  const nodes: Canvas['nodes'] = [];
  const edges: Canvas['edges'] = [];
  // Round-robin em vez de fatiar em blocos: com 4 arquivos e 3 datas, fatiar
  // daria 2+2+0 e a terceira data sumiria da linha do tempo.
  datas.forEach((data, i) => {
    const id = `e_${data.replace(/-/g, '')}`;
    const lote = arquivos.filter((_, k) => k % datas.length === i);
    if (lote.length === 0) return;

    nodes.push({
      id, type: 'text', x: i * 760, y: -60, width: 420, height: 280,
      text: `## 📅 ${data}\n${lote.map((f) => `- ${f.file?.split('/').pop()?.replace(/\.md$/, '')}`).join('\n')}`,
    });

    const anterior = nodes.filter((n) => n.type === 'text')[i - 1];
    if (anterior) {
      edges.push({ id: `edge_${id}`, fromNode: anterior.id, fromSide: 'right', toNode: id, toSide: 'left' });
    }

    lote.forEach((f, j) => {
      nodes.push({ ...f, x: i * 760 + j * 380, y: 420 });
      edges.push({ id: `edge_${f.id}`, fromNode: id, fromSide: 'bottom', toNode: f.id, toSide: 'top' });
    });
  });

  // Escopo pelas DUAS colunas. `userId` sozinho reescreveria todas as páginas
  // da conta; `path` sozinho reescreveria o canvas de todo mundo.
  await db
    .update(kbPages)
    .set({ content: JSON.stringify({ nodes, edges }, null, 2) })
    .where(and(eq(kbPages.userId, userId), eq(kbPages.path, CANVAS_PATH)));
}

async function main(): Promise<void> {
  await limpar();

  const criadas: { plan: Plan; userId: string; token: string }[] = [];

  for (const { plan, nome } of CONTAS) {
    const spec = PLAN_SPEC[plan];
    const [u] = await db
      .insert(users)
      .values({
        email: `${plan}${DOMINIO}`,
        name: nome,
        plan,
        creditsBalance: spec.monthlyCredits,
      })
      .returning();

    const token = crypto.randomBytes(16).toString('hex');
    await db.insert(mcpDevices).values({
      userId: u.id,
      deviceCode: crypto.randomBytes(8).toString('hex'),
      userCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
      status: 'authorized',
      accessToken: token,
      expiresAt: new Date(Date.now() + 365 * 864e5),
    });

    criadas.push({ plan, userId: u.id, token });
  }

  // Só o Pro tem Base da IA — nas outras contas a mesma tool responde com o
  // aviso de upgrade, que é exatamente o que se quer poder demonstrar.
  const pro = criadas.find((c) => c.plan === 'pro');
  if (pro) {
    for (const p of PAGINAS) {
      await runWithMcpContext({ token: pro.token, channel: p.canal }, () =>
        handleKbTool('kb_ingest', {
          title: p.title, type: p.type, body: p.body,
          tags: p.tags, sources: ['session:seed'],
        })
      );
    }
    await espalharCanvas(pro.userId);

    // Um pedido de remoção pendente, para a tela de aprovação ter o que mostrar.
    await runWithMcpContext({ token: pro.token, channel: 'cursor' }, () =>
      handleKbTool('kb_remove_request', {
        path: 'wiki/integrations/evolution-api-para-whatsapp.md',
        reason: 'O cliente saiu do WhatsApp; a integração não é mais usada.',
      })
    );
  }

  console.log('\n┌─ contas de demo ─────────────────────────────────────────');
  for (const c of criadas) {
    const spec = PLAN_SPEC[c.plan];
    const preco = spec.priceCents === null ? 'sob consulta' : `R$ ${(spec.priceCents / 100).toFixed(2)}`;
    console.log(`│ ${spec.label.padEnd(17)} ${preco.padEnd(13)} ${spec.capabilities.length} capacidades`);
    console.log(`│   userId ${c.userId}`);
    console.log(`│   token  ${c.token}`);
  }
  console.log('└──────────────────────────────────────────────────────────');

  const doPro = criadas.find((c) => c.plan === 'pro');
  if (doPro) {
    const n = await db.select({ p: kbPages.path }).from(kbPages).where(eq(kbPages.userId, doPro.userId));
    const l = await db.select({ a: kbLog.action }).from(kbLog).where(eq(kbLog.userId, doPro.userId));
    console.log(`\nBase da IA do Pro: ${n.length} arquivo(s), ${l.length} evento(s) no log.`);
    console.log(`Abra: /pt/dashboard/base?userId=${doPro.userId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERRO:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
