/**
 * Adota assinaturas que existem no Stripe e nunca chegaram ao nosso banco.
 *
 *   pnpm --filter backend run billing:adotar          (só relata)
 *   pnpm --filter backend run billing:adotar -- --aplicar
 *
 * O `billing:reconcile` percorre as assinaturas DAQUI e confere cada uma contra
 * o Stripe. Isso cobre o espelho que ficou velho, mas não o espelho que nunca
 * existiu — e é justamente o que acontece quando o webhook está fora do ar:
 * a pessoa paga, o Stripe cria a assinatura, e o nosso lado nunca fica sabendo.
 * Do ponto de vista dela, pagou e o produto diz que ela não tem plano.
 *
 * A ligação é por E-MAIL do customer, porque nos casos que produzem este buraco
 * as duas vias normais falham: `metadata.userId` fica vazio quando o checkout
 * foi feito sem conta, e `users.stripe_customer_id` só é preenchido pelo webhook
 * que não rodou.
 *
 * Não roda sozinho. Ligar plano pago em conta errada por e-mail parecido é pior
 * do que a situação que ele conserta, então o padrão é relatar e sair.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '../src/db/db.js';
import { users, subscriptions } from '../src/db/schema.js';
import { stripe, isStripeConfigured } from '../src/lib/stripe.js';
import { sincronizarAssinatura } from '../src/routes/billing.js';

/** Estados que valem adoção. Assinatura morta não precisa de espelho. */
const VIVAS: Stripe.Subscription.Status[] = ['trialing', 'active', 'past_due', 'unpaid'];

async function emailDoCustomer(id: string): Promise<string | null> {
  try {
    const c = await stripe().customers.retrieve(id);
    return 'deleted' in c ? null : c.email ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!isStripeConfigured()) {
    console.error('STRIPE_SECRET_KEY ausente.');
    process.exit(1);
  }

  const aplicar = process.argv.includes('--aplicar');
  console.log(aplicar ? 'Modo APLICAR.\n' : 'Modo relatório. Use --aplicar para gravar.\n');

  const jaTemos = new Set(
    (await db.select({ id: subscriptions.stripeSubscriptionId }).from(subscriptions)).map((r) => r.id)
  );

  const doStripe = await stripe().subscriptions.list({ status: 'all', limit: 100 });
  const orfas = doStripe.data.filter((s) => VIVAS.includes(s.status) && !jaTemos.has(s.id));

  if (orfas.length === 0) {
    console.log('Nenhuma assinatura viva fora do banco. Nada a adotar.');
    process.exit(0);
  }

  console.log(`${orfas.length} assinatura(s) viva(s) sem espelho aqui:\n`);

  // Mais de uma assinatura viva para a mesma pessoa é sintoma, não detalhe:
  // significa que ela passou pelo checkout duas vezes e o nosso lado não tinha
  // como saber. Vale aparecer no relatório em vez de ser adotada em silêncio.
  const porEmail = new Map<string, Stripe.Subscription[]>();

  for (const s of orfas) {
    const cid = typeof s.customer === 'string' ? s.customer : s.customer.id;
    const email = await emailDoCustomer(cid);
    const chave = email ?? `(sem e-mail) ${cid}`;
    porEmail.set(chave, [...(porEmail.get(chave) ?? []), s]);
  }

  let adotadas = 0;

  for (const [email, lista] of porEmail) {
    console.log(`${email}`);

    const [conta] = email.startsWith('(')
      ? []
      : await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!conta) {
      console.log('  nenhuma conta com este e-mail — pulando\n');
      continue;
    }

    // Mais nova primeiro: se houver duplicata, é a que a pessoa criou por
    // último e a que ela espera estar valendo.
    const ordenadas = [...lista].sort((a, b) => b.created - a.created);

    if (ordenadas.length > 1) {
      console.log(`  ATENÇÃO: ${ordenadas.length} assinaturas vivas para a mesma conta.`);
      console.log('  Adotando a mais recente; as outras seguem cobrando no Stripe.');
      console.log('  Cancele as sobras no painel do Stripe — não faço isso por conta.');
    }

    for (const [i, s] of ordenadas.entries()) {
      const marca = i === 0 ? 'adotar ' : 'sobra  ';
      const fim = s.trial_end ? ` (teste até ${new Date(s.trial_end * 1000).toISOString().slice(0, 10)})` : '';
      console.log(`  ${marca} ${s.id}  ${s.status}${fim}`);
    }

    if (aplicar) {
      const alvo = ordenadas[0];
      const cid = typeof alvo.customer === 'string' ? alvo.customer : alvo.customer.id;

      // Grava o customer ANTES de sincronizar: `sincronizarAssinatura` resolve
      // a conta por `metadata.userId` ou por este campo, e nos casos que caem
      // aqui o metadata está vazio.
      await db.update(users).set({ stripeCustomerId: cid }).where(eq(users.id, conta.id));
      await sincronizarAssinatura({ ...alvo, metadata: { ...alvo.metadata, userId: conta.id } });

      const [depois] = await db.select({ plan: users.plan, credits: users.creditsBalance })
        .from(users).where(eq(users.id, conta.id)).limit(1);
      console.log(`  -> plano ${conta.plan} => ${depois.plan}, saldo ${depois.credits}`);
      adotadas += 1;
    }
    console.log('');
  }

  console.log(aplicar ? `${adotadas} conta(s) corrigida(s).` : 'Nada gravado. Rode com --aplicar.');
  console.log('\nA causa disto é o webhook fora do ar. Ligue antes de tudo:');
  console.log('  stripe listen --forward-to localhost:3001/api/billing/webhook');
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
