/**
 * Conversão de consumo de LLM em créditos Skiller.
 *
 * A fórmula vivia duplicada em dois pontos do worker, com o markup escrito à
 * mão nos dois. Enquanto ela existiu só lá, o crédito era um registro do que
 * já tinha sido gasto — nunca um limite: o portão em `routes/skills.ts` só
 * pergunta `saldo > 0` antes do job, e o débito vem depois, sem teto. Quem
 * tinha 1 crédito rodava uma playlist inteira e terminava em -299.
 *
 * Com a fórmula aqui, o worker consegue perguntar "já passei do saldo?" no meio
 * da execução, que é o que transforma a franquia do teste em limite de verdade.
 */
import { usageToMicroUsd, type LlmUsage } from '../services/gemini.js';

/** 1 crédito = 1 centavo de dólar de custo bruto. */
const MICRO_USD_POR_CREDITO = 10_000;

/** Multiplicador sobre o custo de API. Cobre infra, suporte e margem. */
export const MARKUP = 5;

/**
 * Créditos correspondentes a um consumo. Mínimo de 1: qualquer chamada que
 * chegou a acontecer custa pelo menos um crédito, senão sequências de jobs
 * minúsculos sairiam de graça.
 */
export function creditosDe(usage: LlmUsage): number {
  return Math.max(1, Math.ceil((usageToMicroUsd(usage) / MICRO_USD_POR_CREDITO) * MARKUP));
}
