/**
 * Exercita os portões de validação da síntese sem tocar em banco, fila ou LLM.
 *
 *   npx tsx scripts/verify-gates.ts
 *
 * Existe porque estes portões podem reprovar um job de produção: se a lógica
 * estiver errada, geração que funcionava passa a falhar. `tsc` não prova isso.
 */
import { assertCardsUsable, assertSynthesisUsable, resolveMainFile } from '../src/lib/skill-package.js';
import { addUsage, usageToMicroUsd, EMPTY_USAGE } from '../src/services/gemini.js';

let pass = 0;
let fail = 0;

const ok = (name: string) => { console.log(`  ok    ${name}`); pass++; };
const bad = (name: string, why: string) => { console.log(`  FALHA ${name} — ${why}`); fail++; };

function deveLancar(name: string, fn: () => void) {
  try { fn(); bad(name, 'deveria ter lançado e não lançou'); }
  catch { ok(name); }
}

function devePassar(name: string, fn: () => void) {
  try { fn(); ok(name); }
  catch (error) { bad(name, String(error)); }
}

const md = '# Skill\n\nConteúdo real aqui.';

console.log('\nPortão 1 — fichas extraídas');
deveLancar('zero fichas reprova', () => assertCardsUsable([], 'abc'));
devePassar('uma ficha aprova', () => assertCardsUsable([{}], 'abc'));

console.log('\nPortão 2 — pacote sintetizado');
deveLancar('pacote sem arquivo reprova', () => assertSynthesisUsable({ files: [] }, 'gemini'));
deveLancar('arquivo principal vazio reprova', () =>
  assertSynthesisUsable({ files: [{ path: 'SKILL.md', content: '   ' }] }, 'gemini'));
deveLancar('markdown sem heading reprova', () =>
  assertSynthesisUsable({ files: [{ path: 'SKILL.md', content: 'só texto solto' }] }, 'gemini'));
devePassar('frontmatter conta como estrutura', () =>
  assertSynthesisUsable({ files: [{ path: 'SKILL.md', content: '---\nname: x\n---\ncorpo' }] }, 'gemini'));

console.log('\nO bug que isto conserta — download 404 em 3 de 5 formatos');
devePassar('claude encontra .cursorrules', () =>
  assertSynthesisUsable({ files: [{ path: '.cursorrules', content: '---\nx: 1\n---\nregras' }] }, 'claude'));
devePassar('copilot encontra copilot-instructions.md', () =>
  assertSynthesisUsable({ files: [{ path: 'copilot-instructions.md', content: md }] }, 'copilot'));
devePassar('mcp encontra src/index.ts sem exigir heading', () =>
  assertSynthesisUsable({ files: [{ path: 'src/index.ts', content: 'export const server = 1;' }] }, 'mcp'));

console.log('\nResolução tolerante ao que o LLM realmente devolve');
const porCaixa = resolveMainFile(
  [{ path: 'modules/a.md', content: 'x' }, { path: 'skill.md', content: md }],
  'gemini'
);
porCaixa?.path === 'skill.md'
  ? ok('ignora diferença de caixa no path')
  : bad('caixa', `resolveu para ${porCaixa?.path}`);

const porBasename = resolveMainFile([{ path: 'out/SKILL.md', content: md }], 'gemini');
porBasename?.path === 'out/SKILL.md'
  ? ok('acha por basename quando a pasta muda')
  : bad('basename', `resolveu para ${porBasename?.path}`);

const semCorrespondencia = resolveMainFile([{ path: 'leia-me.md', content: md }], 'gemini');
semCorrespondencia?.path === 'leia-me.md'
  ? ok('cai no markdown da raiz quando nada casa')
  : bad('fallback', `resolveu para ${semCorrespondencia?.path}`);

console.log('\nTelemetria — conversão de token em dinheiro');
const igual = (name: string, atual: number, esperado: number) =>
  atual === esperado ? ok(name) : bad(name, `esperado ${esperado}, veio ${atual}`);

igual('uso zero custa zero', usageToMicroUsd(EMPTY_USAGE), 0);
igual('1M de input = US$ 1,50', usageToMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }), 1_500_000);
igual('1M de output = US$ 7,50', usageToMicroUsd({ inputTokens: 0, outputTokens: 1_000_000 }), 7_500_000);

// A ADR-001 justifica a escolha do Gemini com "~US$ 0,90 por playlist",
// para 500K de input e 20K de output. É a conta que sustenta o modelo financeiro.
igual(
  'playlist da ADR-001 dá US$ 0,90',
  usageToMicroUsd({ inputTokens: 500_000, outputTokens: 20_000 }),
  900_000
);

const somado = addUsage({ inputTokens: 10, outputTokens: 5 }, { inputTokens: 3, outputTokens: 2 });
somado.inputTokens === 13 && somado.outputTokens === 7
  ? ok('acumula uso entre chamadas')
  : bad('acumular', JSON.stringify(somado));

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
