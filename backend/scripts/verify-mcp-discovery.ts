/**
 * Exercita a autorização das rotas de skill, o CORS e a identidade das tools de
 * MCP — sem tocar em banco, fila, LLM ou rede.
 *
 *   npx tsx scripts/verify-mcp-discovery.ts
 *
 * Existe porque cada bloco aqui cobre um defeito que já esteve em produção e que
 * `tsc` não pega:
 *
 * 1. Nove rotas de `/api/skills/:id` liam o id da URL sem conferir sessão. O
 *    UUID era a credencial, e ele aparece na URL do painel.
 * 2. O CORS devolvia `Allow-Origin` para qualquer origem COM
 *    `Allow-Credentials: true`. O que segurava era o `SameSite=Lax` do cookie,
 *    declarado em outro arquivo.
 * 3. ListTools e CallTool derivavam o nome da tool cada um por sua conta. Mudar
 *    um lado fazia o agente ver tool que não conseguia chamar.
 * 4. `niche` não estava declarado no `responseSchema` do Gemini, que só emite o
 *    que declara. O prompt pedia o campo e a saída o descartava.
 *
 * As fixtures espelham as formas reais do banco (skill com documento, sem
 * documento, colisão de slug, nome com acento) em vez de consultar Postgres: o
 * portão precisa rodar em qualquer máquina e dar sempre o mesmo resultado.
 */

// O ambiente precisa existir ANTES do import: `db/db.ts` e `queue/queue.ts`
// lançam na carga quando falta variável. Endereços inalcançáveis de propósito —
// nada aqui deve chegar em infraestrutura de verdade.
process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '1';
process.env.FRONTEND_URL = 'https://app.skiller.test';
process.env.BACKEND_PORT = '39996';
delete process.env.ALLOW_QUERY_USER;

let pass = 0;
let fail = 0;

const ok = (name: string) => { console.log(`  ok    ${name}`); pass++; };
const bad = (name: string, why: string) => { console.log(`  FALHA ${name} — ${why}`); fail++; };

const igual = (name: string, obtido: unknown, esperado: unknown) =>
  obtido === esperado ? ok(name) : bad(name, `esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);

/** Um documento de skill válido, para reaproveitar nas fixtures. */
function documento(nome: string) {
  return {
    name: nome,
    title: 'Titulo da Skill',
    description: 'Skill para decidir layout, tipografia e cor em interfaces web.',
    goal: 'Produzir interfaces consistentes sem reinventar o sistema a cada tela.',
    principles: [{ title: 'Escala primeiro', rule: 'Sempre fixe a escala de 8pt antes do markup.' }],
    modules: [{
      slug: 'grid', title: 'Grid',
      summary: 'Como compor colunas e calhas em telas largas e estreitas.',
      sections: [{ heading: 'Colunas', body: 'Doze colunas no desktop, quatro no mobile.' }]
    }],
    connectors: [],
    commands: [{ name: '/auditar-design', description: 'Confere a pagina contra o sistema', steps: ['ler'] }],
    humanGuide: { summary: 'Guia para quem mantem esta skill viva ao longo do tempo, com o que revisar.', sections: [] },
  };
}

const UUID = (n: string) => `${n.repeat(8)}-1111-4111-8111-111111111111`;

async function main() {
  const { Hono } = await import('hono');
  const { skillsRouter } = await import('../src/routes/skills.js');
  const { mapaDeTools, descricaoDaSkill } = await import('../src/routes/mcp.js');
  const { SKILL_DOCUMENT_RESPONSE_SCHEMA } = await import('../src/services/gemini.js');
  const { SkillDocumentSchema, SKILL_NICHES } = await import('../src/lib/skill-document.js');

  // ---------------------------------------------------------------------------
  console.log('\nRotas de skill — nenhuma responde sem sessão');
  // ---------------------------------------------------------------------------
  const app = new Hono();
  app.route('/api/skills', skillsRouter);

  const ID = UUID('1');
  const rotas: [string, string, string?][] = [
    ['GET', `/api/skills`],
    ['GET', `/api/skills/${ID}`],
    ['GET', `/api/skills/${ID}/download`],
    ['GET', `/api/skills/${ID}/package`],
    ['POST', `/api/skills/${ID}/retry`],
    ['POST', `/api/skills/${ID}/append`, JSON.stringify({ urls: ['https://youtu.be/x'] })],
    ['DELETE', `/api/skills/${ID}`],
    ['PATCH', `/api/skills/${ID}/file`, JSON.stringify({ path: 'a', content: 'b' })],
    ['PATCH', `/api/skills/${ID}/document`, JSON.stringify({})],
  ];

  for (const [metodo, caminho, body] of rotas) {
    const res = await app.request(caminho, {
      method: metodo,
      body,
      headers: body ? { 'content-type': 'application/json' } : undefined,
    });
    igual(`${metodo} ${caminho.replace(ID, '<id>')} → 401`, res.status, 401);
  }

  // `/migrate-now` executava ALTER TABLE sem autenticação. Removida a rota, o
  // caminho cai no `/:id`, que exige sessão — DDL nenhuma acontece.
  igual('GET /api/skills/migrate-now não executa DDL', (await app.request('/api/skills/migrate-now')).status, 401);

  // O `?t=` é conferido ANTES da consulta: rota sem sessão é rota chamada em
  // laço, e um SELECT por requisição vazia seria amplificação barata. Como o
  // banco daqui é inalcançável, um 404 prova que nada foi consultado — se
  // tocasse Postgres, viria 500.
  igual('GET /:id/plugin sem ?t= → 404 sem tocar o banco',
    (await app.request(`/api/skills/${ID}/plugin`)).status, 404);
  igual('GET /:id/plugin com ?t= errado → 404',
    (await app.request(`/api/skills/${ID}/plugin?t=chute`)).status, 404);

  // ---------------------------------------------------------------------------
  console.log('\nCORS — credenciais só para a origem configurada');
  // ---------------------------------------------------------------------------
  process.env.NODE_ENV = 'production';
  const { app: appReal } = await import('../src/index.js');

  const cabecalhos = async (caminho: string, origem: string) => {
    const res = await appReal.request(caminho, { headers: { Origin: origem } });
    return {
      allow: res.headers.get('access-control-allow-origin'),
      cred: res.headers.get('access-control-allow-credentials'),
    };
  };

  const painel = await cabecalhos('/', 'https://app.skiller.test');
  igual('origem configurada recebe a própria origem', painel.allow, 'https://app.skiller.test');
  igual('origem configurada recebe credentials', painel.cred, 'true');

  // Sem `Allow-Origin` o navegador descarta a resposta. É o que impede um site
  // qualquer de ler a API com o cookie da pessoa.
  igual('origem hostil não recebe Allow-Origin', (await cabecalhos('/', 'https://evil.example')).allow, null);
  igual('localhost recusado em produção', (await cabecalhos('/', 'http://localhost:3000')).allow, null);

  // MCP e `.well-known` são consumidos por IDE, de origem imprevisível, e
  // autenticam por bearer. Curinga aqui é seguro PORQUE não há credencial.
  const mcp = await cabecalhos('/.well-known/oauth-authorization-server', 'https://evil.example');
  igual('.well-known aceita qualquer origem', mcp.allow, '*');
  igual('.well-known não manda credentials', mcp.cred, null);

  // ---------------------------------------------------------------------------
  console.log('\nIdentidade das tools — nome e descrição vêm do skillDocument');
  // ---------------------------------------------------------------------------
  type Linha = Parameters<typeof mapaDeTools>[0][number];
  const linha = (id: string, extra: Record<string, unknown>) =>
    ({ id, name: null, skillDocument: null, skillPackage: { root: {}, blobs: {} }, ...extra }) as unknown as Linha;

  const comDoc = linha(UUID('a'), { skillDocument: documento('gerenciamento-canal-youtube'), name: 'Skill: URGENTE! ME AJUDEM!' });
  const semDoc = linha(UUID('b'), { name: 'Skill: Snake Game Part 4' });
  const acento = linha(UUID('c'), { skillDocument: { ...documento('x'), name: 'Gestão de Anúncios' } });
  const dup1 = linha(UUID('d'), { skillDocument: documento('mcp-server-design') });
  const dup2 = linha(UUID('e'), { skillDocument: documento('mcp-server-design') });

  const mapa = mapaDeTools([comDoc, semDoc, acento, dup1, dup2]);
  const nomes = [...mapa.keys()];

  // O nome do documento vence o título do vídeo. Era daqui que a descoberta
  // morria: o agente via `skill_<uuid>` descrito como o clickbait da fonte.
  igual('nome vem do skillDocument', nomes.includes('gerenciamento-canal-youtube'), true);
  igual('sem documento cai no uuid', nomes.includes(`skill_${UUID('b').replace(/-/g, '_')}`), true);
  igual('acento e espaço são normalizados', nomes.includes('gestao-de-anuncios'), true);

  // Todo nome tem de ser aceitável para o cliente MCP: nome inválido faz a tool
  // sumir da lista, que é o mesmo que não existir.
  const VALIDO = /^[a-zA-Z0-9_-]{1,64}$/;
  igual('todos os nomes são válidos para MCP', nomes.every((n) => VALIDO.test(n)), true);
  igual('nenhum nome se repete', new Set(nomes).size, nomes.length);

  // Colisão sufixa TODAS as envolvidas: assim o nome de uma skill não depende de
  // qual outra veio antes na consulta.
  igual('slug repetido não fica sem sufixo', nomes.includes('mcp-server-design'), false);
  igual('slug repetido gera dois nomes distintos',
    nomes.filter((n) => n.startsWith('mcp-server-design-')).length, 2);

  // O contrato que impede tool anunciada e não-chamável: o nome resolve de volta
  // para a mesma linha, que é exatamente o que o CallTool faz.
  igual('nome resolve de volta para a skill', mapa.get('gerenciamento-canal-youtube')?.id, comDoc.id);

  igual('descrição usa o texto do documento',
    descricaoDaSkill(comDoc).startsWith('Skill para decidir layout'), true);
  igual('descrição não vaza o título do vídeo',
    descricaoDaSkill(comDoc).includes('URGENTE'), false);
  igual('sem documento a descrição diz que é a FONTE',
    descricaoDaSkill(semDoc).includes('gerada a partir da fonte'), true);

  // ---------------------------------------------------------------------------
  console.log('\nresponseSchema do Gemini — o provider só emite o que declara');
  // ---------------------------------------------------------------------------
  const props = Object.keys(SKILL_DOCUMENT_RESPONSE_SCHEMA.properties);
  const req: readonly string[] = SKILL_DOCUMENT_RESPONSE_SCHEMA.required;

  igual('niche está declarado', props.includes('niche'), true);
  igual('niche é obrigatório', req.includes('niche'), true);
  igual('modules é obrigatório', req.includes('modules'), true);

  // `required` citando propriedade inexistente só apareceria como erro do
  // provider em runtime — nem `tsc` nem lint pegam.
  const orfaos = req.filter((r) => !props.includes(r));
  igual('required só cita propriedades declaradas', orfaos.length, 0);

  // Prompt, Zod e provider precisam concordar sobre os nichos; três listas
  // escritas à mão divergem.
  const enumNiche = (SKILL_DOCUMENT_RESPONSE_SCHEMA.properties.niche as { enum: readonly string[] }).enum;
  igual('enum de niche bate com SKILL_NICHES', [...enumNiche].join(','), SKILL_NICHES.join(','));

  // ---------------------------------------------------------------------------
  console.log('\nZod — o nicho editável no painel sobrevive ao round-trip');
  // ---------------------------------------------------------------------------
  const base = documento('agente-de-design');
  igual('niche válido é aceito', SkillDocumentSchema.safeParse({ ...base, niche: 'design' }).success, true);
  igual('niche ausente é aceito', SkillDocumentSchema.safeParse(base).success, true);
  igual('niche inválido é recusado', SkillDocumentSchema.safeParse({ ...base, niche: 'culinaria' }).success, false);

  // O `<select>` do editor manda `undefined` ao desclassificar, nunca `''`.
  // Se mandasse string vazia o save quebraria com 400 e ninguém saberia por quê.
  igual('string vazia é recusada (por isso o editor manda undefined)',
    SkillDocumentSchema.safeParse({ ...base, niche: '' }).success, false);

  console.log(`\n${pass} passaram, ${fail} falharam\n`);
  process.exit(fail ? 1 : 0);
}

main();
