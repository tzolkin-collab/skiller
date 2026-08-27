/**
 * Reconcilia as assinaturas com o Stripe.
 *
 * Existe porque o webhook e a unica coisa que move `users.plan`, e webhook e
 * entrega best-effort: endpoint fora do ar, deploy no momento errado, conta do
 * Stripe suspensa — qualquer um desses deixa o banco mentindo. E a mentira e
 * sempre a favor do cliente: ele fica no plano pago sem pagar.
 *
 * Idempotente. Rode de tempos em tempos (cron diario resolve) e depois de
 * qualquer janela em que o servidor ficou fora.
 *
 *   pnpm --filter backend run billing:reconcile
 */
import 'dotenv/config';
import { eq, ne, isNull, and } from 'drizzle-orm';
import { db } from '../src/db/db.js';
import { users, subscriptions } from '../src/db/schema.js';
import { stripe, isStripeConfigured } from '../src/lib/stripe.js';
import { sincronizarAssinatura } from '../src/routes/billing.js';
import { planoVigente } from '../src/lib/entitlements.js';

async function main(): Promise<void> {
  if (!isStripeConfigured()) {
    console.error('STRIPE_SECRET_KEY ausente.');
    process.exit(1);
  }

  const espelhos = await db.select().from(subscriptions);
  console.log(`${espelhos.length} assinatura(s) no banco.\n`);

  let mudou = 0;
  for (const linha of espelhos) {
    const antes = (await db.select({ plan: users.plan }).from(users).where(eq(users.id, linha.userId)).limit(1))[0];

    try {
      const doStripe = await stripe().subscriptions.retrieve(linha.stripeSubscriptionId);
      await sincronizarAssinatura(doStripe);

      const depois = (await db.select({ plan: users.plan }).from(users).where(eq(users.id, linha.userId)).limit(1))[0];
      const marca = antes?.plan !== depois?.plan ? '  <-- CORRIGIDO' : '';
      if (marca) mudou += 1;
      console.log(
        `  ${linha.stripeSubscriptionId.padEnd(22)} ${String(linha.status).padEnd(10)} -> ${String(doStripe.status).padEnd(10)}` +
        ` plano ${antes?.plan} -> ${depois?.plan}${marca}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Assinatura que sumiu do Stripe: derruba o plano, nao mantem por duvida.
      if (msg.includes('No such subscription')) {
        await db.update(users).set({ plan: 'free', planValidUntil: null }).where(eq(users.id, linha.userId));
        await db.delete(subscriptions).where(eq(subscriptions.id, linha.id));
        mudou += 1;
        console.log(`  ${linha.stripeSubscriptionId.padEnd(22)} nao existe mais no Stripe -> conta rebaixada  <-- CORRIGIDO`);
      } else {
        console.log(`  ${linha.stripeSubscriptionId.padEnd(22)} ERRO: ${msg.slice(0, 60)}`);
      }
    }
  }

  // Contas em plano pago sem nenhuma assinatura registrada. Nao rebaixo
  // sozinho: pode ser cortesia dada a mao, e derrubar cliente por engano e pior
  // que a receita perdida. Reporta para decisao humana.
  const suspeitas = await db
    .select({ id: users.id, email: users.email, plan: users.plan, ate: users.planValidUntil })
    .from(users)
    .where(and(ne(users.plan, 'free'), isNull(users.stripeCustomerId)));

  if (suspeitas.length > 0) {
    console.log(`\n${suspeitas.length} conta(s) em plano pago sem cliente no Stripe:`);
    for (const u of suspeitas) {
      const vigente = planoVigente(u.plan, u.ate);
      console.log(`  ${u.email.padEnd(34)} plan=${String(u.plan).padEnd(11)} vigente=${vigente}`);
    }
    console.log('  (cortesia concedida a mao, ou resquicio de dado antigo — decisao humana)');
  }

  console.log(`\n${mudou} correcao(oes) aplicada(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERRO:', e); process.exit(1); });
