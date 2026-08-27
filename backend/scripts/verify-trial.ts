/**
 * Prova o teste de 3 dias com franquia própria.
 *
 *   npx tsx scripts/verify-trial.ts
 *
 * O ponto delicado não é conceder o crédito — é NÃO reconceder. O Stripe manda
 * vários `customer.subscription.updated` durante um teste; se cada um recarregar
 * a franquia, o teste vira ilimitado e ninguém percebe até a fatura do Gemini.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '../src/db/db.js';
import { users, subscriptions } from '../src/db/schema.js';
import { PLAN_SPEC } from '../src/lib/plans.js';
import { sincronizarAssinatura, usuarioJaTestou } from '../src/routes/billing.js';

let pass = 0, fail = 0;
const ok = (n: string) => { console.log(`  ok    ${n}`); pass++; };
const bad = (n: string, why: string) => { console.log(`  FALHA ${n} — ${why}`); fail++; };
const eq_ = (n: string, got: unknown, want: unknown) =>
  got === want ? ok(`${n} (${String(got)})`) : bad(n, `esperado ${String(want)}, veio ${String(got)}`);

const spec = PLAN_SPEC.starter;
const priceId = process.env.STRIPE_PRICE_STARTER_MONTHLY ?? 'price_starter_mensal';
const customerId = 'cus_teste_' + randomUUID().slice(0, 8);
const subId = 'sub_teste_' + randomUUID().slice(0, 8);
const userId = randomUUID();

const fim = Math.floor(Date.now() / 1000) + 3 * 86400;
const assinatura = (status: string): Stripe.Subscription =>
  ({
    id: subId,
    customer: customerId,
    status,
    cancel_at_period_end: false,
    metadata: { userId, plan: 'starter' },
    items: { data: [{ price: { id: priceId, currency: 'brl', recurring: { interval: 'month' } }, current_period_end: fim }] },
  }) as unknown as Stripe.Subscription;

const saldo = async () =>
  (await db.select({ credits: users.creditsBalance, plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1))[0];

async function main() {
  console.log('\n1 — Configuração do teste (uma fonte só)');
  // 3 dias é requisito do produto, então é asserção. A franquia é decisão de
  // negócio e muda sem aviso — o que precisa valer é a relação com a mensal.
  eq_('PLAN_SPEC.starter.trialDays', spec.trialDays, 3);
  spec.trialCredits !== undefined
    ? ok(`franquia do teste definida (${spec.trialCredits} créditos)`)
    : bad('franquia', 'plano com teste mas sem franquia — a pessoa entraria sem crédito');
  spec.trialCredits! < spec.monthlyCredits
    ? ok(`franquia do teste (${spec.trialCredits}) é menor que a mensal (${spec.monthlyCredits})`)
    : bad('franquia', 'teste não é menor que o mês inteiro');

  await db.insert(users).values({
    id: userId, email: `trial-${userId.slice(0, 8)}@verificacao.local`,
    name: 'Verificação de teste', plan: 'free', creditsBalance: 0,
  });

  console.log('\n2 — Entrada no teste concede a franquia');
  await sincronizarAssinatura(assinatura('trialing'));
  let u = await saldo();
  eq_('plano vira starter', u.plan, 'starter');
  eq_('saldo recebe a franquia do teste', u.credits, spec.trialCredits);

  console.log('\n3 — Consumo é preservado entre eventos do Stripe');
  await db.update(users).set({ creditsBalance: 40 }).where(eq(users.id, userId));
  await sincronizarAssinatura(assinatura('trialing'));
  u = await saldo();
  eq_('segundo `updated` no teste NÃO recarrega', u.credits, 40);
  await sincronizarAssinatura(assinatura('trialing'));
  u = await saldo();
  eq_('terceiro também não', u.credits, 40);

  console.log('\n4 — Fim do teste');
  await sincronizarAssinatura(assinatura('active'));
  u = await saldo();
  eq_('virar `active` não zera nem recarrega (quem recarrega é invoice.paid)', u.credits, 40);
  eq_('plano segue starter', u.plan, 'starter');

  await sincronizarAssinatura(assinatura('canceled'));
  u = await saldo();
  eq_('cancelar derruba o plano', u.plan, 'free');
  eq_('e zera o saldo', u.credits, PLAN_SPEC.free.monthlyCredits);

  console.log('\n5 — O teste é por pessoa, não por assinatura');
  // Quem cancelou e volta não ganha outro teste: o checkout deixa de pedir
  // `trial_period_days`, então o Stripe já cria a assinatura cobrando.
  (await usuarioJaTestou(userId))
    ? ok('conta com assinatura anterior é marcada como já testada')
    : bad('teste único', 'conta que já assinou passaria por novo teste');

  const virgem = randomUUID();
  await db.insert(users).values({
    id: virgem, email: `virgem-${virgem.slice(0, 8)}@verificacao.local`,
    name: 'Sem histórico', plan: 'free', creditsBalance: 0,
  });
  (await usuarioJaTestou(virgem))
    ? bad('teste único', 'conta nova foi barrada do teste')
    : ok('conta sem histórico ainda tem direito ao teste');
  await db.delete(users).where(eq(users.id, virgem));

  await db.delete(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subId));
  await db.delete(users).where(eq(users.id, userId));
  console.log(`\n${pass} passaram, ${fail} falharam\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.delete(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subId)).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
  process.exit(1);
});
