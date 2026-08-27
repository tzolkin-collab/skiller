/**
 * Acerta os dados anteriores à separação por conta e à cobrança.
 *
 * Duas heranças ficaram no banco:
 *
 *  1. Skills sem dono. Nasceram antes de existir multiusuário. Enquanto as
 *     tools do MCP varriam a tabela inteira, elas apareciam para todo mundo;
 *     depois que passaram a filtrar por dono, sumiram para todo mundo. Ficam
 *     ocupando espaço e invisíveis.
 *
 *  2. Contas em plano pago que nunca pagaram. O default da coluna `plan` era
 *     `starter`, então todo cadastro anterior à cobrança nasceu com conector e
 *     edição liberados.
 *
 * Rode com `--aplicar`; sem isso apenas relata o que faria.
 *
 *   pnpm --filter backend run fix:legacy -- --aplicar
 */
import 'dotenv/config';
import { eq, and, isNull, isNotNull, ne, inArray, notLike } from 'drizzle-orm';
import { db } from '../src/db/db.js';
import { users, skills } from '../src/db/schema.js';
import { PLAN_SPEC } from '../src/lib/plans.js';

const APLICAR = process.argv.includes('--aplicar');

/** A conta que o backend usa quando ninguém se identifica. Herda as órfãs. */
const EMAIL_PADRAO = 'dummy@skiller.com';

async function main(): Promise<void> {
  console.log(APLICAR ? '=== APLICANDO ===\n' : '=== SIMULAÇÃO (use --aplicar para valer) ===\n');

  // ------------------------------------------------------------ 1. órfãs
  const orfas = await db
    .select({ id: skills.id, nome: skills.name, temPacote: skills.skillPackage })
    .from(skills)
    .where(isNull(skills.userId));

  console.log(`1. SKILLS SEM DONO: ${orfas.length}`);
  if (orfas.length > 0) {
    const [padrao] = await db.select().from(users).where(eq(users.email, EMAIL_PADRAO)).limit(1);

    if (!padrao) {
      console.log(`   conta "${EMAIL_PADRAO}" não existe — nada a fazer sem um destino.`);
    } else {
      const comPacote = orfas.filter((o) => o.temPacote).length;
      console.log(`   ${comPacote} com pacote MCP, ${orfas.length - comPacote} sem.`);
      console.log(`   destino: ${EMAIL_PADRAO}`);
      // Adotar em vez de apagar: é trabalho de extração que custou chamada de
      // LLM. Se depois se confirmar que é lixo, apagar continua possível — o
      // contrário não.
      if (APLICAR) {
        await db.update(skills).set({ userId: padrao.id }).where(isNull(skills.userId));
        console.log(`   ${orfas.length} skill(s) adotadas.`);
      }
    }
  }

  // ------------------------------------------------- 2. planos herdados
  // Só contas sem cliente no Stripe: quem tem histórico de cobrança pagou de
  // verdade e não pode ser rebaixado por um script de limpeza.
  const herdadas = await db
    .select({ id: users.id, email: users.email, plan: users.plan, creditos: users.creditsBalance })
    .from(users)
    .where(and(
      ne(users.plan, 'free'),
      isNull(users.stripeCustomerId),
      notLike(users.email, '%@demo.skiller.local'),
    ));

  console.log(`\n2. PLANO PAGO SEM PAGAMENTO: ${herdadas.length}`);
  for (const u of herdadas) {
    console.log(`   ${u.email.padEnd(32)} ${u.plan} → free   (${u.creditos} créditos preservados)`);
  }
  if (herdadas.length > 0 && APLICAR) {
    // O saldo fica como está. Plano define a recarga mensal; saldo mede o que
    // já foi usado. Zerar um saldo existente seria arbitrário.
    await db
      .update(users)
      .set({ plan: 'free', planValidUntil: null })
      .where(inArray(users.id, herdadas.map((u) => u.id)));
    console.log(`   ${herdadas.length} conta(s) normalizadas.`);
  }

  // As contas do seed ficam de fora de propósito: elas existem justamente para
  // demonstrar cada nível, e rebaixá-las esvaziaria a demonstração.
  const doSeed = await db
    .select({ email: users.email, plan: users.plan })
    .from(users)
    .where(and(ne(users.plan, 'free'), isNull(users.stripeCustomerId)));
  const seed = doSeed.filter((u) => u.email.endsWith('@demo.skiller.local'));
  if (seed.length > 0) {
    console.log(`\n   preservadas (seed de demonstração): ${seed.map((u) => u.plan).join(', ')}`);
  }

  // -------------------------------------------------------- 3. conferência
  console.log('\n3. DEPOIS');
  const restantes = await db.select({ id: skills.id }).from(skills).where(isNull(skills.userId));
  const pagos = await db
    .select({ email: users.email, plan: users.plan, cust: users.stripeCustomerId, ate: users.planValidUntil })
    .from(users)
    .where(ne(users.plan, 'free'));

  console.log(`   skills sem dono: ${restantes.length}`);
  console.log(`   contas em plano pago: ${pagos.length}`);
  for (const p of pagos) {
    const origem = p.cust ? 'assinatura' : p.email.endsWith('@demo.skiller.local') ? 'seed' : 'SEM ORIGEM';
    const val = p.ate ? p.ate.toISOString().slice(0, 10) : 'sem prazo';
    console.log(`     ${p.email.padEnd(32)} ${String(p.plan).padEnd(11)} ${origem.padEnd(11)} vale até ${val}`);
  }

  const comCliente = await db.select({ id: users.id }).from(users).where(isNotNull(users.stripeCustomerId));
  console.log(`   contas com cliente no Stripe: ${comCliente.length}`);
  console.log(`\n   franquia por plano: ` +
    Object.entries(PLAN_SPEC).map(([k, v]) => `${k}=${v.monthlyCredits}`).join('  '));

  if (!APLICAR) console.log('\nNada foi alterado. Rode com --aplicar.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERRO:', e); process.exit(1); });
