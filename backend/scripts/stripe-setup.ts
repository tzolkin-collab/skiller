/**
 * Provisiona o catálogo no Stripe a partir de `plans.ts`.
 *
 * A direção importa: o código é a fonte da verdade e o Stripe é provisionado a
 * partir dele. O contrário — preços digitados no painel do Stripe e repetidos
 * no código — foi o que produziu o site anunciando R$97 enquanto o agente
 * dizia R$99,99.
 *
 * Idempotente. Preço no Stripe é imutável no valor, então mudar um número aqui
 * não edita o preço antigo: cria um novo, transfere a `lookup_key` para ele e
 * arquiva o anterior. Quem já assinou continua no preço que contratou — que é
 * o comportamento certo, e por isso a `lookup_key` existe.
 *
 *   pnpm --filter backend run stripe:setup
 */
import 'dotenv/config';
import type Stripe from 'stripe';
import { stripe, isStripeConfigured } from '../src/lib/stripe.js';
import {
  PAID_PLANS, PRICING, PLAN_SPEC, CURRENCY_SYMBOL,
  lookupKey, type BillingPeriod,
} from '../src/lib/plans.js';

/** Moeda base do preço. As outras entram como `currency_options` do mesmo preço. */
const BASE = 'brl';
const PERIODOS: BillingPeriod[] = ['monthly', 'annual'];

function dinheiro(centavos: number, moeda: 'BRL' | 'USD' | 'EUR'): string {
  return CURRENCY_SYMBOL[moeda] + ' ' + (centavos / 100).toFixed(2);
}

/**
 * O produto canônico do plano.
 *
 * A identidade estável é a `lookup_key` do preço, não o produto: é por ela que
 * o checkout busca, e é ela que sobrevive a recriações. Então a ordem certa é
 * partir do preço e chegar ao produto — não o contrário.
 *
 * Uma versão anterior partia do produto e escolhia "o mais antigo" entre
 * duplicados. Escolheu errado: os preços em uso pertenciam ao mais novo, e
 * arquivar o dono deles derrubou o checkout com "product is not active".
 */
async function acharOuCriarProduto(plan: 'starter' | 'pro'): Promise<Stripe.Product> {
  let canonico: Stripe.Product | null = null;

  for (const period of PERIODOS) {
    const achados = await stripe().prices.list({
      lookup_keys: [lookupKey(plan, period)], active: true, limit: 1,
    });
    const preco = achados.data[0];
    if (!preco) continue;

    const id = typeof preco.product === 'string' ? preco.product : preco.product.id;
    const prod = await stripe().products.retrieve(id);

    if (!prod.active) {
      // Produto arquivado com preço ativo em cima: o checkout recusa. Desarquiva.
      await stripe().products.update(id, { active: true });
      console.log('  produto  ' + id + ' (estava arquivado com preços ativos — reativado)');
      canonico = await stripe().products.retrieve(id);
    } else {
      canonico = prod;
    }
    break;
  }

  // Nenhum preço nosso ainda: cai para a metadata, e só então cria.
  if (!canonico) {
    const todos = await stripe().products.list({ limit: 100, active: true });
    canonico = todos.data.filter((p) => p.metadata?.skiller_plan === plan)[0] ?? null;
  }

  if (canonico) {
    console.log('  produto  ' + canonico.id + ' (reusado)');
    await arquivarDuplicados(plan, canonico.id);
    return canonico;
  }

  const spec = PLAN_SPEC[plan];
  const criado = await stripe().products.create({
    name: 'Skiller ' + spec.label,
    description:
      spec.monthlyCredits + ' créditos por mês · ' +
      spec.capabilities.length + ' recursos · ' +
      spec.members + (spec.members === 1 ? ' usuário' : ' usuários'),
    metadata: { skiller_plan: plan },
  });
  console.log('  produto  ' + criado.id + ' (criado)');
  return criado;
}

/**
 * Arquiva produtos nossos que não são o canônico.
 *
 * Arquivar e não apagar: o Stripe não deixa apagar produto com preço, e as
 * faturas antigas precisam dele de pé. Só toca em produtos com a nossa
 * metadata — a conta pode ter outros, de outros projetos.
 */
async function arquivarDuplicados(plan: 'starter' | 'pro', manterId: string): Promise<void> {
  const todos = await stripe().products.list({ limit: 100, active: true });
  for (const p of todos.data) {
    if (p.metadata?.skiller_plan !== plan || p.id === manterId) continue;
    await stripe().products.update(p.id, { active: false });
    console.log('  produto  ' + p.id + ' (duplicado — arquivado)');
  }
}

/**
 * Garante o preço da `lookup_key` com os valores da tabela.
 *
 * Se já existe um preço com esses mesmos valores, não faz nada. Se os valores
 * mudaram, cria o novo, leva a chave junto e arquiva o velho.
 */
async function garantirPreco(
  produto: Stripe.Product,
  plan: 'starter' | 'pro',
  period: BillingPeriod
): Promise<string> {
  const chave = lookupKey(plan, period);
  const tabela = PRICING[plan][period];

  // `currency_options` NÃO vem por padrão. Sem o expand, a comparação abaixo
  // achava que os valores tinham mudado e recriava o preço a cada execução,
  // arquivando o anterior — o oposto de idempotente.
  const existentes = await stripe().prices.list({
    lookup_keys: [chave], active: true, limit: 1,
    expand: ['data.currency_options'],
  });
  const atual = existentes.data[0];

  const iguala =
    atual &&
    atual.unit_amount === tabela.BRL &&
    atual.currency === BASE &&
    atual.currency_options?.usd?.unit_amount === tabela.USD &&
    atual.currency_options?.eur?.unit_amount === tabela.EUR &&
    atual.recurring?.interval === (period === 'annual' ? 'year' : 'month');

  if (iguala) {
    console.log('  ' + chave.padEnd(24) + ' ' + atual.id + ' (em dia)');
    return atual.id;
  }

  const novo = await stripe().prices.create({
    product: produto.id,
    currency: BASE,
    unit_amount: tabela.BRL,
    // Um preço só servindo três moedas. Três preços separados obrigariam o
    // checkout a escolher o id certo e sairiam do ar em pares na primeira
    // atualização esquecida.
    currency_options: {
      usd: { unit_amount: tabela.USD },
      eur: { unit_amount: tabela.EUR },
    },
    recurring: { interval: period === 'annual' ? 'year' : 'month' },
    lookup_key: chave,
    // Tira a chave do preço antigo e põe neste. Sem isto, criar o novo falharia
    // por chave duplicada.
    transfer_lookup_key: true,
    metadata: { skiller_plan: plan, skiller_period: period },
  });

  if (atual) {
    // Arquivar, não apagar: as assinaturas em andamento continuam apontando
    // para ele e o histórico de faturas precisa dele de pé.
    await stripe().prices.update(atual.id, { active: false });
    console.log('  ' + chave.padEnd(24) + ' ' + novo.id + ' (novo; ' + atual.id + ' arquivado)');
  } else {
    console.log('  ' + chave.padEnd(24) + ' ' + novo.id + ' (criado)');
  }

  console.log(
    '      ' +
    dinheiro(tabela.BRL, 'BRL') + '  ' +
    dinheiro(tabela.USD, 'USD') + '  ' +
    dinheiro(tabela.EUR, 'EUR') +
    (period === 'annual' ? '  (por ano)' : '  (por mês)')
  );

  return novo.id;
}

/**
 * Configura o portal de cobrança do Stripe.
 *
 * Sem isto o portal nasce oferecendo apenas cancelar, trocar cartão e ver
 * faturas — TROCAR DE PLANO vem desligado por padrão. Na prática, quem clicava
 * em "gerenciar assinatura" só encontrava o botão de cancelar, que é o oposto
 * do que a pessoa foi fazer.
 *
 * Fica aqui, e não no painel do Stripe, pela mesma razão dos preços: um ajuste
 * feito à mão some quando alguém recria a conta ou sobe outro ambiente.
 */
async function garantirPortal(catalogo: { produto: string; precos: string[] }[]): Promise<void> {
  const app = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id', 'name'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_update: {
      // A correção que importa: vinha DESLIGADO por padrão, então "gerenciar
      // assinatura" só oferecia cancelar.
      enabled: true,
      default_allowed_updates: ['price'],
      // Cobra ou credita a diferença na hora da troca. Sem isto, subir de plano
      // no meio do ciclo sairia de graça até a próxima fatura.
      proration_behavior: 'create_prorations',
      // Quais planos aparecem na troca. Obrigatório — a API recusa sem isto.
      //
      // Não estranhe se um `retrieve` não devolver este campo: a leitura o
      // omite nesta versão da API. O jeito de conferir que ficou gravado é
      // justamente tentar salvar sem ele e ver a recusa.
      products: catalogo.map((c) => ({ product: c.produto, prices: c.precos })),
    },
    subscription_cancel: {
      enabled: true,
      // No fim do período pago, não na hora: a pessoa já pagou por ele.
      mode: 'at_period_end',
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
      },
    },
  };

  const perfil = {
    headline: 'Skiller — sua assinatura',
    privacy_policy_url: app + '/pt/legal/privacidade',
    terms_of_service_url: app + '/pt/legal/termos',
  };

  const existentes = await stripe().billingPortal.configurations.list({ limit: 10 });
  const nossa = existentes.data.find((c) => c.metadata?.skiller === 'default') ?? existentes.data.find((c) => c.is_default);

  if (nossa) {
    await stripe().billingPortal.configurations.update(nossa.id, {
      features, business_profile: perfil, metadata: { skiller: 'default' },
    });
    console.log('  portal ' + nossa.id + ' (atualizado)');
  } else {
    const criada = await stripe().billingPortal.configurations.create({
      features, business_profile: perfil, metadata: { skiller: 'default' },
    });
    console.log('  portal ' + criada.id + ' (criado)');
  }

  console.log('    trocar de plano, trocar cartão, faturas e cancelar no fim do período');
}

async function main(): Promise<void> {
  if (!isStripeConfigured()) {
    console.error('STRIPE_SECRET_KEY ausente. Defina no .env antes de rodar.');
    process.exit(1);
  }

  const conta = await stripe().accounts.retrieve();
  const modo = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'PRODUÇÃO' : 'teste';
  console.log('Conta ' + conta.id + ' — modo ' + modo + '\n');

  const catalogo: { produto: string; precos: string[] }[] = [];

  for (const plan of PAID_PLANS) {
    console.log(PLAN_SPEC[plan].label);
    const produto = await acharOuCriarProduto(plan);
    const precos: string[] = [];
    for (const period of PERIODOS) {
      precos.push(await garantirPreco(produto, plan, period));
    }
    catalogo.push({ produto: produto.id, precos });
    console.log('');
  }

  console.log('Portal de cobrança');
  await garantirPortal(catalogo);
  console.log('');

  console.log('Catálogo em dia.\n');
  console.log('Falta ligar o webhook para o plano mudar sozinho quando o pagamento entrar:');
  console.log('  stripe listen --forward-to localhost:3001/api/billing/webhook');
  console.log('e copiar o `whsec_...` que ele imprime para STRIPE_WEBHOOK_SECRET no .env.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERRO:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
