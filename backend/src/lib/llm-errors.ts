/**
 * O que vale tentar de novo e o que não vale.
 *
 * Antes disto todo erro era tratado igual: a fila refazia o job 3 vezes e o
 * cliente do LLM só reenviava em 429. O resultado medido no banco: um mesmo
 * skill rodou 22 vezes em um dia contra o mesmo erro que nunca ia passar, e o
 * 503 de "alta demanda" do Gemini — que passa sozinho em segundos — derrubava
 * o vídeo na primeira ocorrência.
 *
 * Duas famílias:
 *   - transitória: sobrecarga, limite de taxa, rede. Tentar de novo resolve.
 *   - permanente: entrada inválida, política, conteúdo reprovado. Tentar de
 *     novo gasta dinheiro para chegar ao mesmo lugar.
 */
import { getErrorMessage } from './errors.js';

/**
 * Falha que não adianta repetir. Lançada de propósito quando o código já sabe
 * que a próxima tentativa terminaria igual — por exemplo, vídeo sem legenda e
 * longo demais para leitura direta.
 */
export class PermanentJobError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentJobError';
  }
}

const STATUS_TRANSITORIOS = new Set([408, 425, 429, 500, 502, 503, 504]);

// O SDK do Gemini entrega o erro HTTP como texto JSON dentro de `message`
// (`{"error":{"code":503,"status":"UNAVAILABLE",...}}`), então o texto também
// precisa ser lido — o `status` numérico nem sempre vem preenchido.
const TEXTO_TRANSITORIO =
  /UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|high demand|overloaded|rate.?limit|too many requests|timed? ?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|fetch failed|\b(?:408|425|429|500|502|503|504)\b/i;

/** Código HTTP anexado ao erro, quando existe. */
export function statusDoErro(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const { status, code } = error as { status?: unknown; code?: unknown };
    if (typeof status === 'number') return status;
    if (typeof code === 'number') return code;
  }
  return null;
}

/** `true` quando repetir a mesma chamada tem chance real de dar certo. */
export function isTransientError(error: unknown): boolean {
  if (error instanceof PermanentJobError) return false;

  // Um código explícito manda: 400/401/403/404 nunca melhoram com o tempo.
  const status = statusDoErro(error);
  if (status !== null) return STATUS_TRANSITORIOS.has(status);

  return TEXTO_TRANSITORIO.test(getErrorMessage(error, ''));
}

/**
 * Espera antes da tentativa seguinte: exponencial, com jitter de até 25 %.
 * O jitter evita que N vídeos derrubados juntos pelo mesmo 503 voltem juntos e
 * derrubem o provedor de novo.
 */
export function backoffMs(tentativa: number, baseMs = 2000): number {
  return Math.round(baseMs * 2 ** tentativa * (1 + Math.random() * 0.25));
}

export const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
