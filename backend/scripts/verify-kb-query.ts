/**
 * Exercita a selecao de paginas do `kb_query` sem tocar em banco.
 *
 *   npx tsx scripts/verify-kb-query.ts
 *
 * Existe por causa de um caso real: perguntado sobre "o conector MCP e a
 * autenticacao OAuth", o `kb_query` de producao devolveu uma skill de vendas
 * B2B e outra de crise de canal do YouTube. Nenhuma das duas fala de conector
 * MCP — as duas tinham a tag `mcp` e uma secao "Conectores Utilizados", e o
 * ranqueamento por `includes()` nao sabia distinguir isso de relevancia.
 *
 * As fixtures abaixo sao a reducao desse caso. Se voltarem a passar pelo
 * ranking, a regressao aparece aqui antes de aparecer no contexto do agente.
 */
import { rankPages, excerpt, tokenize } from '../src/lib/kb.js';

let pass = 0;
let fail = 0;
const ok = (name: string) => { console.log(`  ok    ${name}`); pass++; };
const bad = (name: string, why: string) => { console.log(`  FALHA ${name} — ${why}`); fail++; };
const conferir = (name: string, cond: boolean, why: string) => (cond ? ok(name) : bad(name, why));

// ---------------------------------------------------------------------------
// Fixtures — as tres paginas do caso real, reduzidas
// ---------------------------------------------------------------------------

const vendas = {
  path: 'wiki/integrations/skill-vender-saas-b2b-integracoes.md',
  title: 'Estrategias de Vendas B2B para Fundadores Tecnicos — Integracoes e Conectores',
  tags: ['skill', 'integrations', 'mcp'],
  content: `---
title: Estrategias de Vendas B2B — Integracoes e Conectores
tags: [skill, integrations, mcp]
---

## Conectores Utilizados

Ferramentas de ambiente que o agente utiliza para executar as tarefas desta skill:

- sequential-thinking (Opcional): a estrategia de vendas B2B e a estruturacao de
  playbooks exigem raciocinio multi-etapas.
- memory (Opcional): manter contexto de negociacoes e perfil de cliente ideal.
- fetch (Opcional): buscar informacoes de mercado e analisar concorrentes.

## Playbook

Defina o ICP, estruture a proposta de valor e acompanhe o funil semanalmente.`,
};

const youtube = {
  path: 'wiki/integrations/skill-crise-canal-youtube-integracoes.md',
  title: 'Gestao de Crise de Canal YouTube — Integracoes e Conectores',
  tags: ['skill', 'integrations', 'mcp'],
  content: `---
title: Gestao de Crise de Canal YouTube — Integracoes e Conectores
tags: [skill, integrations, mcp]
---

## Conectores Utilizados

- sequential-thinking (Opcional): analise de bloqueios e plano de contingencia.
- memory (Opcional): manter o status do canal entre interacoes.
- fetch (Opcional): revisar as diretrizes publicas da plataforma.

## Plano de contingencia

Crie um canal secundario com e-mail separado e mova o conteudo de nicho.`,
};

const conector = {
  path: 'wiki/architecture/conector-mcp-oauth.md',
  title: 'Conector MCP do Skiller — descoberta e OAuth',
  tags: ['conector', 'oauth', 'seguranca'],
  content: `---
title: Conector MCP do Skiller — descoberta e OAuth
tags: [conector, oauth, seguranca]
---

## Resumo

O endpoint /api/mcp e protegido por OAuth. Sem token a resposta e 401 com
WWW-Authenticate apontando o resource metadata, conforme a RFC 9728.

## Detalhes

A descoberta do authorization server segue a RFC 8414: authorize, token,
register e revoke, com PKCE S256 obrigatorio.`,
};

const base = [vendas, youtube, conector];
const pergunta = 'O que a base registra sobre o conector MCP do Skiller e sua autenticacao OAuth?';

// ---------------------------------------------------------------------------

console.log('\nO bug que isto conserta — pergunta sobre conector trazia vendas e YouTube');

// O ranqueamento antigo, reproduzido para provar que o caso e real e nao teorico.
const antigo = base
  .map((p) => {
    const termos = pergunta.toLowerCase().split(/\s+/).filter((t) => t.length > 3).slice(0, 6);
    const alvo = `${p.title} ${p.content}`.toLowerCase();
    return { path: p.path, score: termos.reduce((s, t) => s + (alvo.includes(t) ? 1 : 0), 0) };
  })
  .filter((p) => p.score > 0)
  .sort((a, b) => b.score - a.score);

conferir(
  'ranking antigo promovia as paginas erradas',
  antigo.some((p) => p.path === vendas.path) || antigo.some((p) => p.path === youtube.path),
  'a fixture nao reproduz mais o bug — reveja o caso antes de confiar no teste'
);

const r = rankPages(pergunta, base);
conferir('a pagina do conector vem em primeiro', r[0]?.path === conector.path,
  `veio ${r[0]?.path ?? 'nada'}`);
conferir('skill de vendas nao entra', !r.some((p) => p.path === vendas.path),
  'ruido ainda passa pelo corte');
conferir('skill de canal do YouTube nao entra', !r.some((p) => p.path === youtube.path),
  'ruido ainda passa pelo corte');

console.log('\nAssunto que a base nao cobre — o kb_query precisa saber dizer que nao sabe');

// O caso exato de producao: a base tem so as skills geradas, nada sobre o
// conector. Antes do piso, a resposta era a pagina de vendas B2B — e quem
// chamou sintetizava em cima dela sem saber que era ruido.
const semResposta = rankPages(pergunta, [vendas, youtube]);
conferir('base sem a pagina do conector devolve vazio', semResposta.length === 0,
  `devolveu ${semResposta.map((p) => p.path).join(', ')}`);
conferir('a mesma pergunta com a pagina presente continua respondendo',
  rankPages(pergunta, base).length > 0,
  'o piso ficou alto demais e engoliu a resposta certa');

console.log('\nTokenizacao');
conferir('stopword nao vira termo', tokenize('sobre como isso deve ser feito').length === 0,
  `sobrou ${JSON.stringify(tokenize('sobre como isso deve ser feito'))}`);
conferir('acento nao separa a palavra', tokenize('autenticação').join() === 'autenticacao',
  JSON.stringify(tokenize('autenticação')));
conferir('sigla curta sobrevive', tokenize('mcp e kb').includes('kb'), 'kb foi descartado');

console.log('\nPergunta so de stopword nao casa a base inteira');
conferir('devolve vazio em vez de tudo', rankPages('como fazer isso para mim', base).length === 0,
  'pergunta vazia de conteudo ainda retorna paginas');

console.log('\nTermo presente em toda pagina nao decide ranking');
const todas = base.map((p) => ({ ...p, content: `${p.content}\n\nskill gerada pelo skiller.` }));
conferir('cai no fallback por frequencia em vez de dizer "nada"',
  rankPages('skill skiller', todas).length > 0,
  'IDF zerado deixou a consulta sem resposta');

console.log('\nPeso de titulo');
const mencao = {
  path: 'wiki/features/a.md', title: 'Fila de sintese', tags: [] as string[],
  content: 'Processa jobs. O worker cita oauth uma vez de passagem e segue.',
};
const noTitulo = {
  path: 'wiki/features/b.md', title: 'OAuth do painel', tags: [] as string[],
  content: 'Como o painel troca o codigo pelo token de sessao do usuario.',
};
const rt = rankPages('oauth', [mencao, noTitulo]);
conferir('bater no titulo ganha de mencao no corpo', rt[0]?.path === noTitulo.path,
  `veio ${rt[0]?.path ?? 'nada'}`);

console.log('\nRecorte da pagina devolvida');
const longa = `---
title: Pagina longa
---

## Introducao

${'Texto de enchimento que nao responde nada. '.repeat(60)}

## Autenticacao OAuth

O fluxo usa PKCE S256 e o token expira em uma hora.

## Apendice

${'Mais enchimento irrelevante para a pergunta. '.repeat(60)}`;

const trecho = excerpt(longa, 'como funciona a autenticacao oauth');
conferir('encolhe a pagina longa', trecho.length < longa.length,
  `${trecho.length} vs ${longa.length}`);
conferir('mantem a secao que responde', trecho.includes('PKCE S256'),
  'o recorte jogou fora justamente a secao relevante');
conferir('mantem o frontmatter', trecho.startsWith('---'), 'perdeu titulo/tags/fontes');
conferir('avisa que omitiu', trecho.includes('kb_read'), 'nao aponta como ler a pagina inteira');
conferir('pagina curta passa inteira', excerpt(conector.content, pergunta) === conector.content,
  'recortou uma pagina que cabia');

console.log(`\n${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
