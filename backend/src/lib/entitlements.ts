/**
 * O portão de plano do lado HTTP.
 *
 * As tools MCP consultam `plans.ts` direto porque já resolvem a conta pelo
 * Bearer. As rotas do painel não têm token — identificam o usuário pelo
 * `?userId=` (o mock de auth que existe hoje) ou pelo dono do recurso. Este
 * módulo é o único lugar que faz essa tradução, para o dia em que houver
 * sessão de verdade mudar só aqui.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/db.js';
import { users, skills } from '../db/schema.js';
import { type Capability, type Plan, can, normalizePlan, requiredPlan, PLAN_SPEC, upgradeMessage } from './plans.js';

/** Plano da conta. Usuário inexistente cai no mais restrito, nunca no mais aberto. */
export async function planOf(userId: string | null | undefined): Promise<Plan> {
  if (!userId) return 'free';
  const rows = await db
    .select({ plan: users.plan, validUntil: users.planValidUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) return 'free';
  return planoVigente(rows[0].plan, rows[0].validUntil);
}

/**
 * O plano que vale AGORA.
 *
 * `users.plan` diz o que o Stripe avisou da última vez. Se aquele aviso foi o
 * último e a validade já passou, a assinatura acabou e ninguém nos contou —
 * webhook perdido, endpoint fora do ar, conta do Stripe suspensa. Sem esta
 * checagem a pessoa seguiria no Pro de graça indefinidamente.
 *
 * `planValidUntil` nulo significa "sem prazo": plano gratuito, ou concedido a
 * mão. Nesses casos o valor da coluna manda.
 */
export function planoVigente(plan: string | null | undefined, validUntil: Date | null): Plan {
  const p = normalizePlan(plan);
  if (p === 'free' || !validUntil) return p;
  return validUntil.getTime() >= Date.now() ? p : 'free';
}

/**
 * Dono e plano de uma skill. Editar é direito do dono, então a fonte é a linha
 * da skill — não o `?userId=` da request, que qualquer um pode escrever.
 */
export async function planOfSkill(skillId: string): Promise<{ userId: string | null; plan: Plan } | null> {
  const rows = await db.select({ userId: skills.userId }).from(skills).where(eq(skills.id, skillId)).limit(1);
  if (rows.length === 0) return null;
  const userId = rows[0].userId;
  return { userId, plan: await planOf(userId) };
}

export interface Denial {
  error: 'plan_required';
  capability: Capability;
  currentPlan: Plan;
  requiredPlan: Plan;
  message: string;
  /** Para o front poder mostrar preço sem carregar o catálogo inteiro. */
  priceCents: number | null;
}

/**
 * Retorna o corpo da recusa, ou `null` quando o plano cobre a capacidade.
 * 402 Payment Required é o código honesto aqui: a request está bem formada e
 * autenticada, o que falta é o plano.
 */
export function denyUnless(plan: Plan, cap: Capability): Denial | null {
  if (can(plan, cap)) return null;
  const alvo = requiredPlan(cap);
  return {
    error: 'plan_required',
    capability: cap,
    currentPlan: plan,
    requiredPlan: alvo,
    message: upgradeMessage(cap, plan),
    priceCents: PLAN_SPEC[alvo].priceCents,
  };
}
