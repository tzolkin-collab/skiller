/**
 * Prova que uma conta não consegue abrir uma segunda assinatura.
 *
 *   pnpm --filter backend run verify:assinatura
 *
 * Não é hipótese: aconteceu duas vezes no mesmo dia. Passar pelo checkout duas
 * vezes rendeu dois testes, e subir de Starter para Pro pelo Settings abriria
 * uma segunda assinatura em vez de trocar a primeira — duas cobranças no mês
 * seguinte, por dois caminhos diferentes.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/db.js';
import { users, subscriptions } from '../src/db/schema.js';
import { assinaturaVigenteDe } from '../src/routes/billing.js';

let pass = 0, fail = 0;
const ok = (n: string) => { console.log(`  ok    ${n}`); pass++; };
const bad = (n: string, w: string) => { console.log(`  FALHA ${n} — ${w}`); fail++; };

const API = 'http://localhost:3001';
const userId = randomUUID();
const email = `uma-${userId.slice(0, 8)}@verificacao.local`;

async function checkout(rota: string) {
  const r = await fetch(`${API}/api/billing${rota}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, plan: 'pro', period: 'monthly', currency: 'BRL', lang: 'pt' }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}

async function semear(status: string) {
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.insert(subscriptions).values({
    userId,
    stripeSubscriptionId: 'sub_verif_' + randomUUID().slice(0, 8),
    stripeCustomerId: 'cus_verif',
    plan: 'starter',
    status,
    currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    cancelAtPeriodEnd: false,
  });
}

async function main() {
  await db.insert(users).values({ id: userId, email, name: 'Uma assinatura', plan: 'free' });

  console.log('\n1 — Sem assinatura, o checkout abre');
  for (const rota of ['/checkout', '/checkout/elements']) {
    const r = await checkout(rota);
    r.status === 200 ? ok(`${rota} responde 200`) : bad(rota, `veio ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }

  console.log('\n2 — Com assinatura viva, os DOIS caminhos recusam');
  for (const status of ['trialing', 'active', 'past_due']) {
    await semear(status);
    const vigente = await assinaturaVigenteDe(userId);
    vigente ? ok(`\`${status}\` ocupa o lugar`) : bad(status, 'nao foi reconhecida como vigente');

    for (const rota of ['/checkout', '/checkout/elements']) {
      const r = await checkout(rota);
      r.status === 409 && r.body.error === 'subscription_exists'
        ? ok(`  ${rota} recusa com 409`)
        : bad(`${status} ${rota}`, `veio ${r.status}`);
    }
  }

  console.log('\n3 — A recusa diz o que fazer');
  await semear('active');
  const r = await checkout('/checkout');
  String(r.body.message).includes('portal') ? ok('aponta o portal de cobrança') : bad('mensagem', String(r.body.message).slice(0, 60));
  r.body.usePortal === true ? ok('e marca `usePortal` para a tela decidir') : bad('usePortal', String(r.body.usePortal));
  r.body.currentPlan === 'starter' ? ok('e informa o plano atual') : bad('currentPlan', String(r.body.currentPlan));

  console.log('\n4 — Assinatura morta NÃO bloqueia');
  for (const status of ['canceled', 'incomplete_expired']) {
    await semear(status);
    const r2 = await checkout('/checkout');
    r2.status === 200 ? ok(`\`${status}\` deixa assinar de novo`) : bad(status, `veio ${r2.status}`);
  }

  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  console.log(`\n${pass} passaram, ${fail} falharam\n`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId)).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
  process.exit(1);
});
