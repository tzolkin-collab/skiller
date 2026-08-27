/**
 * Exercita o webhook de cobrança sem conta no Stripe.
 *
 * A assinatura que o Stripe manda é um HMAC-SHA256 de `timestamp.corpo` com o
 * segredo do endpoint. Sabendo o segredo, dá para forjar eventos legítimos e
 * testar a máquina de estados inteira — que é justamente a parte que não pode
 * estar errada quando dinheiro entra.
 */
import 'dotenv/config';
import crypto from 'crypto';
import { eq, like } from 'drizzle-orm';
import { db } from '../src/db/db.js';
import { users, subscriptions, stripeEvents } from '../src/db/schema.js';

const BASE = 'http://localhost:3001';
const SEGREDO = process.env.STRIPE_WEBHOOK_SECRET ?? '';

function assinar(corpo: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const mac = crypto.createHmac('sha256', SEGREDO).update(`${ts}.${corpo}`).digest('hex');
  return `t=${ts},v1=${mac}`;
}

async function enviar(evento: unknown): Promise<{ status: number; body: string }> {
  const corpo = JSON.stringify(evento);
  const res = await fetch(`${BASE}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': assinar(corpo) },
    body: corpo,
  });
  return { status: res.status, body: (await res.text()).slice(0, 90) };
}

let n = 0;
function evento(type: string, object: unknown) {
  n += 1;
  return { id: `evt_teste_${n}`, object: 'event', type, data: { object } };
}

/** Pergunta ao portão HTTP qual plano ele concede — não à coluna. */
async function planoVigenteViaGate(userId: string): Promise<string> {
  const { planOf } = await import('../src/lib/entitlements.js');
  return planOf(userId);
}

async function planoDe(userId: string): Promise<{ plan: string; credits: number }> {
  const r = await db
    .select({ plan: users.plan, credits: users.creditsBalance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return r[0];
}

async function main(): Promise<void> {
  if (!SEGREDO) {
    console.error('STRIPE_WEBHOOK_SECRET ausente no ambiente do teste.');
    process.exit(1);
  }

  const alvo = (
    await db.select({ id: users.id, plan: users.plan }).from(users).where(like(users.email, 'free@demo.skiller.local'))
  )[0];
  if (!alvo) {
    console.error('Rode o seed antes: pnpm --filter backend run seed');
    process.exit(1);
  }

  const CUSTOMER = 'cus_teste_skiller';
  const SUB = 'sub_teste_skiller';

  console.log(`conta de teste ${alvo.id} — plano inicial "${alvo.plan}"\n`);

  // 1. Assinatura falsificada: o servidor tem de recusar antes de olhar o corpo.
  const corpoRuim = JSON.stringify(evento('customer.subscription.created', {}));
  const ruim = await fetch(`${BASE}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=mentira' },
    body: corpoRuim,
  });
  console.log(`1. assinatura forjada          HTTP ${ruim.status}  ${ruim.status === 400 ? 'recusada' : 'ACEITOU (!!)'}`);

  // 2. Checkout concluído: grava customer, país e documento fiscal.
  const r2 = await enviar(
    evento('checkout.session.completed', {
      id: 'cs_teste',
      client_reference_id: alvo.id,
      customer: CUSTOMER,
      customer_details: {
        address: { country: 'BR' },
        tax_ids: [{ type: 'br_cpf', value: '111.444.777-35' }],
      },
    })
  );
  const dep2 = (
    await db
      .select({ c: users.stripeCustomerId, p: users.billingCountry, t: users.taxId, tt: users.taxIdType })
      .from(users)
      .where(eq(users.id, alvo.id))
  )[0];
  console.log(
    `2. checkout.session.completed  HTTP ${r2.status}  customer=${dep2.c}  pais=${dep2.p}  doc=${dep2.tt}:${dep2.t}`
  );

  // 3. Assinatura ativa: o plano tem de subir para Pro.
  const assinaturaAtiva = {
    id: SUB,
    customer: CUSTOMER,
    status: 'active',
    cancel_at_period_end: false,
    metadata: { userId: alvo.id, plan: 'pro' },
    items: {
      data: [
        {
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          price: { id: 'price_teste', currency: 'brl', lookup_key: 'skiller_pro_monthly', recurring: { interval: 'month' } },
        },
      ],
    },
  };
  const r3 = await enviar(evento('customer.subscription.created', assinaturaAtiva));
  const d3 = await planoDe(alvo.id);
  console.log(`3. subscription.created        HTTP ${r3.status}  plano=${d3.plan}  creditos=${d3.credits}`);

  // 4. Reentrega do mesmo evento: tem de ser reconhecida como duplicata.
  const repetido = { id: 'evt_teste_3', object: 'event', type: 'customer.subscription.created', data: { object: assinaturaAtiva } };
  const r4 = await enviar(repetido);
  console.log(`4. reentrega do mesmo evento   HTTP ${r4.status}  ${r4.body}`);

  // 5. Fatura paga: recarrega a franquia. Gasta créditos antes para dar o que ver.
  await db.update(users).set({ creditsBalance: 12 }).where(eq(users.id, alvo.id));
  const r5 = await enviar(evento('invoice.paid', { id: 'in_teste', customer: CUSTOMER }));
  const d5 = await planoDe(alvo.id);
  console.log(`5. invoice.paid (saldo era 12) HTTP ${r5.status}  creditos=${d5.credits}`);

  // 6. Cartão recusado: `past_due` NÃO derruba o plano — o Stripe ainda tenta.
  const r6 = await enviar(evento('customer.subscription.updated', { ...assinaturaAtiva, status: 'past_due' }));
  const d6 = await planoDe(alvo.id);
  console.log(`6. status past_due             HTTP ${r6.status}  plano=${d6.plan}  (deve seguir pro)`);

  // 7. Cancelamento: aí sim cai para free e o saldo volta ao do gratuito.
  const r7 = await enviar(evento('customer.subscription.deleted', { ...assinaturaAtiva, status: 'canceled' }));
  const d7 = await planoDe(alvo.id);
  console.log(`7. subscription.deleted        HTTP ${r7.status}  plano=${d7.plan}  creditos=${d7.credits}`);

  // 8. Sobrou o espelho da assinatura no banco?
  const espelho = (await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, SUB)))[0];
  console.log(
    `8. espelho em subscriptions    status=${espelho?.status}  plano=${espelho?.plan}  moeda=${espelho?.currency}  vence=${espelho?.currentPeriodEnd?.toISOString().slice(0, 10)}`
  );

  console.log('');
  console.log('--- RENOVACAO ---');

  // 9. Fatura que chega antes de qualquer vínculo.
  //    Antes isto era um `return` silencioso: a pessoa pagava a renovação e
  //    ficava sem créditos, sem nada no log. Agora falha alto, e falhar faz o
  //    Stripe reentregar — que é o comportamento que recupera o dinheiro.
  await db.delete(subscriptions).where(eq(subscriptions.stripeSubscriptionId, SUB));
  await db.update(users).set({ stripeCustomerId: null }).where(eq(users.id, alvo.id));
  const r9 = await enviar(evento('invoice.paid', { id: 'in_orfa', customer: 'cus_desconhecido' }));
  console.log(`9.  fatura sem vínculo         HTTP ${r9.status}  ${r9.status === 500 ? 'falhou alto (Stripe reentrega)' : 'ACEITOU EM SILÊNCIO (!!)'}`);

  // 10. Ordem invertida: assinatura primeiro, e é ela quem vincula o customer.
  //     Depois a fatura encontra a conta e recarrega.
  await db.update(users).set({ creditsBalance: 5 }).where(eq(users.id, alvo.id));
  await enviar(evento('customer.subscription.created', assinaturaAtiva));
  const vinculo = (await db.select({ c: users.stripeCustomerId }).from(users).where(eq(users.id, alvo.id)))[0];
  const r10 = await enviar(evento('invoice.paid', { id: 'in_renov', customer: CUSTOMER }));
  const d10 = await planoDe(alvo.id);
  console.log(`10. assinatura antes da fatura  HTTP ${r10.status}  customer vinculado=${vinculo.c === CUSTOMER}  creditos 5 -> ${d10.credits}`);

  // 11. Renovação move a validade para frente.
  const antesVal = (await db.select({ v: users.planValidUntil }).from(users).where(eq(users.id, alvo.id)))[0].v;
  const proximoCiclo = {
    ...assinaturaAtiva,
    items: { data: [{ ...assinaturaAtiva.items.data[0], current_period_end: Math.floor(Date.now() / 1000) + 60 * 86400 }] },
  };
  await enviar(evento('customer.subscription.updated', proximoCiclo));
  const depoisVal = (await db.select({ v: users.planValidUntil }).from(users).where(eq(users.id, alvo.id)))[0].v;
  const avancou = Boolean(antesVal && depoisVal && depoisVal > antesVal);
  console.log(`11. renovação move a validade   ${antesVal?.toISOString().slice(0, 10)} -> ${depoisVal?.toISOString().slice(0, 10)}  ${avancou ? 'avançou' : 'NÃO AVANÇOU (!!)'}`);
  console.log(`    (folga de 3 dias sobre o fim do período: a renovação não é instantânea)`);

  // 12. Webhook perdido: a validade vence e o portão rebaixa sozinho, mesmo com
  //     `users.plan` ainda dizendo "pro".
  await db
    .update(users)
    .set({ planValidUntil: new Date(Date.now() - 86400_000) })
    .where(eq(users.id, alvo.id));
  const bruto = (await db.select({ p: users.plan }).from(users).where(eq(users.id, alvo.id)))[0].p;
  const conta = await (await fetch(`${BASE}/api/account?userId=${alvo.id}`)).json();
  const vigente = await planoVigenteViaGate(alvo.id);
  console.log(`12. validade vencida            coluna diz "${bruto}"  ·  portão concede "${vigente}"  ·  ${vigente === 'free' ? 'protegido' : 'AINDA LIBERA (!!)'}`);
  console.log(`    /api/account reporta ${conta.plan?.id} (a coluna crua; o portão é quem decide o acesso)`);

  // limpeza
  await db.delete(subscriptions).where(eq(subscriptions.stripeSubscriptionId, SUB));
  await db.delete(stripeEvents).where(like(stripeEvents.id, 'evt_teste_%'));
  await db.update(users).set({ planValidUntil: null }).where(eq(users.id, alvo.id));
  await db
    .update(users)
    .set({ stripeCustomerId: null, billingCountry: null, taxId: null, taxIdType: null, plan: 'free', creditsBalance: 100 })
    .where(eq(users.id, alvo.id));
  console.log('\nlimpo.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
