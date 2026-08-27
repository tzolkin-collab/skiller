/**
 * Prova que a franquia do teste é um limite, e não um registro do que já foi
 * gasto.
 *
 *   npx tsx scripts/verify-cap.ts
 *
 * Antes: `routes/skills.ts` só perguntava `saldo > 0` antes de enfileirar, e o
 * débito vinha no fim do job, sem teto. Uma conta com 1 crédito processava uma
 * playlist de 50 vídeos e terminava com saldo negativo — o custo já tinha sido
 * pago à Google. Este script simula o loop do worker contra a mesma regra que
 * ele usa agora.
 */
import { creditosDe, MARKUP } from '../src/lib/credits.js';
import { addUsage, usageToMicroUsd, EMPTY_USAGE, type LlmUsage } from '../src/services/gemini.js';
import { PLAN_SPEC } from '../src/lib/plans.js';

let pass = 0, fail = 0;
const ok = (n: string) => { console.log(`  ok    ${n}`); pass++; };
const bad = (n: string, why: string) => { console.log(`  FALHA ${n} — ${why}`); fail++; };
const eq_ = (n: string, got: unknown, want: unknown) =>
  got === want ? ok(`${n} (${String(got)})`) : bad(n, `esperado ${String(want)}, veio ${String(got)}`);

/** Consumo típico de um vídeo: transcrição na entrada, card na saída. */
const POR_VIDEO: LlmUsage = { inputTokens: 12_000, outputTokens: 900 };

/** O mesmo laço do worker, reduzido à decisão de parar. */
function simular(videos: number, saldo: number) {
  let uso: LlmUsage = { ...EMPTY_USAGE };
  let processados = 0, cortados = 0;
  for (let i = 0; i < videos; i++) {
    if (i > 0 && creditosDe(uso) >= saldo) { cortados = videos - i; break; }
    uso = addUsage(uso, POR_VIDEO);
    processados++;
  }
  return { processados, cortados, custo: creditosDe(uso) };
}

console.log('\n1 — A fórmula tem uma fonte só');
eq_('markup', MARKUP, 5);
eq_('consumo zero ainda custa o mínimo de 1', creditosDe(EMPTY_USAGE), 1);
const umVideo = creditosDe(POR_VIDEO);
umVideo > 0 ? ok(`um vídeo custa ${umVideo} crédito(s) (${usageToMicroUsd(POR_VIDEO)} µUSD brutos)`) : bad('custo', 'zero');
creditosDe(addUsage(POR_VIDEO, POR_VIDEO)) > umVideo
  ? ok('o custo cresce com o consumo')
  : bad('monotonia', 'dois vídeos não custam mais que um');

console.log('\n2 — O cenário que motivou a mudança: 1 crédito, 50 vídeos');
const magro = simular(50, 1);
magro.processados === 1
  ? ok('para no primeiro vídeo, não nos 50')
  : bad('teto', `processou ${magro.processados} vídeos com 1 crédito`);
eq_('e reporta quantos ficaram de fora', magro.cortados, 49);

console.log('\n3 — A franquia do teste aguenta um uso honesto');
const teste = PLAN_SPEC.starter.trialCredits!;
const cabe = Math.floor(teste / umVideo);
// Capacidade é decisão de negócio, não invariante — o script informa, não reprova.
console.log(`  info  ${teste} créditos dão ~${cabe} vídeos no teste`);
cabe >= 1 ? ok('a franquia do teste processa ao menos um vídeo') : bad('franquia', 'nem um vídeo cabe');

const cheio = simular(50, teste);
cheio.processados < 50
  ? ok(`playlist de 50 é cortada em ${cheio.processados} vídeos dentro do teste`)
  : bad('teto', 'a franquia do teste não barrou uma playlist de 50');
cheio.custo <= teste + umVideo
  ? ok(`estouro limitado a um vídeo (gastou ${cheio.custo} de ${teste})`)
  : bad('estouro', `gastou ${cheio.custo} com franquia de ${teste}`);

console.log('\n4 — Quem paga não é cortado por engano');
const pago = simular(50, PLAN_SPEC.starter.monthlyCredits);
eq_('Starter mensal processa a playlist inteira', pago.processados, 50);
eq_('sem cortes', pago.cortados, 0);

const semDono = simular(50, Number.POSITIVE_INFINITY);
eq_('job sem userId (script interno) não é barrado', semDono.processados, 50);

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
