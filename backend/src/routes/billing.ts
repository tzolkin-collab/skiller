/**
 * Cobrança via Stripe Checkout.
 *
 * Por que Checkout hospedado e não um formulário nosso: o cartão nunca toca
 * nosso servidor, o que tira o projeto quase inteiro do escopo de PCI, e os
 * meios de pagamento habilitados no painel do Stripe aparecem sozinhos conforme
 * a moeda — sem implementarmos um fluxo por meio.
 *
 * Ressalva sobre o Brasil: em `mode: 'subscription'` o meio garantido é cartão.
 * Pix no Stripe é para cobrança avulsa, não para assinatura recorrente. Se a
 * cobrança recorrente por Pix virar requisito, ela não sai daqui — sai de um
 * gateway local (o Asaas já é usado na Tzolkin) ou de um fluxo de faturas
 * avulsas em `mode: 'payment'`.
 *
 * A localização entra em dois momentos distintos:
 *   1. ANTES — o país detectado na request escolhe a moeda, para o brasileiro
 *      não pagar em dólar e tomar IOF sem perceber;
 *   2. DENTRO — o Stripe pede endereço e documento fiscal, e o que ele devolve
 *      (confirmado pelo cliente, não adivinhado) é o que gravamos.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db/db.js';
import { users, subscriptions, stripeEvents, identities } from '../db/schema.js';
import { stripe, isStripeConfigured, appUrl } from '../lib/stripe.js';
import { detectCurrency } from '../lib/geo.js';
import { enviarEmail } from '../lib/email.js';
import * as tpl from '../lib/email-templates.js';
import { usuarioAtual, pareceUuid, naoAutenticado } from '../lib/current-user.js';
import {
  PLAN_SPEC, PRICING, CURRENCY_SYMBOL, CURRENCIES,
  type Currency, type BillingPeriod, type Plan,
  lookupKey, isPurchasable, normalizePlan,
} from '../lib/plans.js';

export const billingRouter = new Hono();

/** Stripe Tax só funciona se estiver habilitado na conta; ligar às cegas quebra o checkout. */
const IMPOSTO_AUTOMATICO = process.env.STRIPE_AUTOMATIC_TAX === 'true';

billingRouter.use('*', async (c, next) => {
  if (!isStripeConfigured()) {
    return c.json(
      { error: 'billing_unavailable', message: 'Cobrança não configurada neste ambiente.' },
      503
    );
  }
  await next();
});

/**
 * Traduz falhas do Stripe.
 *
 * Sem isto, uma chave errada ou um cartão recusado chegam ao navegador como
 * "Internal Server Error" — a pessoa não sabe se tenta outro cartão ou se o
 * problema é nosso. E a distinção importa: `StripeCardError` é do cliente,
 * `StripeAuthenticationError` é nosso e nunca deve virar texto na tela dela.
 */
billingRouter.onError((erro, c) => {
  const e = erro as { type?: string; code?: string; message?: string };

  switch (e.type) {
    case 'StripeCardError':
      // O Stripe já escreve estas mensagens para o cliente final, traduzidas.
      return c.json({ error: 'card_declined', code: e.code, message: e.message }, 402);

    case 'StripeRateLimitError':
      return c.json({ error: 'rate_limited', message: 'Muitas tentativas. Tente de novo em instantes.' }, 429);

    case 'StripeAuthenticationError':
    case 'StripePermissionError':
      // Problema de configuração nossa. O log recebe o detalhe; o cliente não.
      console.error('[billing] credencial do Stripe rejeitada:', e.message);
      return c.json(
        { error: 'billing_misconfigured', message: 'A cobrança está indisponível no momento.' },
        503
      );

    case 'StripeConnectionError':
      return c.json({ error: 'stripe_unreachable', message: 'Não foi possível falar com o Stripe.' }, 502);

    case 'StripeInvalidRequestError':
      console.error('[billing] request inválida ao Stripe:', e.message);
      return c.json({ error: 'invalid_request', message: 'Pedido de cobrança inválido.' }, 400);

    default:
      console.error('[billing] falha inesperada:', erro);
      return c.json({ error: 'internal', message: 'Falha ao processar a cobrança.' }, 500);
  }
});

// ---------------------------------------------------------------- catálogo

/**
 * Preços na moeda de quem está perguntando.
 *
 * A página de preços consome isto em vez de manter a própria tabela — foi a
 * tabela duplicada que fez o site anunciar um valor e o agente citar outro.
 */
/** Estados em que a assinatura ocupa o lugar: não cabe uma segunda ao lado. */
const OCUPA_LUGAR = ['trialing', 'active', 'past_due', 'unpaid'];

/**
 * A assinatura que já ocupa o lugar desta conta, se houver.
 *
 * Uma conta tem UMA assinatura. Trocar de plano é alterar a que existe — pelo
 * portal do Stripe, que já faz proration —, nunca abrir outra ao lado.
 *
 * Sem esta regra o produto cobrava duas vezes por dois caminhos diferentes:
 * subir de Starter para Pro pelo Settings criava uma segunda assinatura em vez
 * de mudar a primeira, e passar pelo checkout duas vezes rendia dois testes.
 * Os dois aconteceram de verdade antes disto existir.
 */
export async function assinaturaVigenteDe(
  userId: string
): Promise<{ id: string; plan: string; status: string } | null> {
  const linhas = await db
    .select({
      id: subscriptions.stripeSubscriptionId,
      plan: subscriptions.plan,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));

  return linhas.find((l) => OCUPA_LUGAR.includes(l.status)) ?? null;
}

/**
 * Se esta conta já usou o período de teste alguma vez.
 *
 * Qualquer assinatura anterior conta, inclusive cancelada: é justamente o
 * ciclo assinar → cancelar → assinar que o teste único precisa fechar.
 */
export async function usuarioJaTestou(userId: string): Promise<boolean> {
  const [anterior] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return Boolean(anterior);
}

billingRouter.get('/pricing', (c) => {
  const forcada = c.req.query('currency')?.toUpperCase();
  const escolhida = CURRENCIES.includes(forcada as Currency);
  const detectada = detectCurrency(c);
  const currency: Currency = escolhida ? (forcada as Currency) : detectada.currency;

  return c.json({
    currency,
    symbol: CURRENCY_SYMBOL[currency],
    country: detectada.country,
    /** `true` quando o cliente não escolheu — o front pode oferecer a troca. */
    detected: !escolhida,
    plans: (Object.keys(PLAN_SPEC) as Plan[]).map((id) => {
      const spec = PLAN_SPEC[id];
      const base = {
        id,
        label: spec.label,
        capabilities: spec.capabilities,
        monthlyCredits: spec.monthlyCredits,
        members: spec.members,
        // O teste sai daqui pelo mesmo motivo que o preço: escrito à mão na
        // página, ele desencontra do que o Stripe realmente aplica.
        trialDays: spec.trialDays ?? null,
        trialCredits: spec.trialCredits ?? null,
      };
      if (!isPurchasable(id)) {
        // Free e Enterprise não têm preço de tabela: um é grátis, o outro passa
        // por vendas. O front decide o CTA por este campo.
        return { ...base, purchasable: false, monthly: null, annual: null };
      }
      const mensal = PRICING[id].monthly[currency];
      const anual = PRICING[id].annual[currency];
      return {
        ...base,
        purchasable: true,
        monthly: mensal,
        annual: anual,
        /** Mensal equivalente do anual, para a página exibir "R$ x/mês". */
        annualPerMonth: Math.round(anual / 12),
        savingsPercent: Math.round((1 - anual / (mensal * 12)) * 100),
      };
    }),
  });
});

// ---------------------------------------------------------------- checkout

interface CorpoCheckout {
  userId?: string;
  plan?: string;
  period?: string;
  currency?: string;
  lang?: string;
  /**
   * E-mail de quem está comprando sem conta.
   *
   * Só o modo Elements usa. No hospedado quem pede o e-mail é o formulário do
   * Stripe; no nosso, o campo é nosso — e sem ele o webhook não teria de onde
   * criar a conta depois do pagamento.
   */
  email?: string;
}

/**
 * Cache dos preços por `lookup_key`.
 *
 * `prices.list` custava ~220ms de ida e volta ao Stripe em TODA abertura de
 * checkout — 30% do tempo total — para buscar um dado que só muda quando
 * `scripts/stripe-setup.ts` roda. Guardar em memória tira essa espera do
 * caminho de quem está comprando.
 *
 * O TTL é curto de propósito: um processo que ficasse com o preço velho depois
 * de um `stripe:setup` cobraria o valor errado. Cinco minutos é menos do que
 * leva para perceber e reiniciar, e o suficiente para cobrir uma rajada.
 *
 * Cache por processo, não compartilhado. Com várias instâncias cada uma paga
 * a primeira busca — é o preço de não trazer Redis para o caminho da cobrança.
 */
const PRECO_TTL_MS = 5 * 60 * 1000;
const precosEmCache = new Map<string, { price: Stripe.Price; em: number }>();

async function precoPorLookupKey(chave: string): Promise<Stripe.Price | null> {
  const guardado = precosEmCache.get(chave);
  if (guardado && Date.now() - guardado.em < PRECO_TTL_MS) return guardado.price;

  const precos = await stripe().prices.list({ lookup_keys: [chave], active: true, limit: 1 });
  const price = precos.data[0];
  // Ausência não entra no cache: se o preço ainda não existe, é porque falta
  // rodar o setup — e queremos que passe a funcionar assim que ele rodar.
  if (price) precosEmCache.set(chave, { price, em: Date.now() });
  return price ?? null;
}

/**
 * Resolve plano, período, moeda, preço e conta — a parte que os dois modos de
 * checkout compartilham.
 *
 * Existem dois modos porque o formulário mudou de dono: o hospedado manda o
 * navegador para `checkout.stripe.com`, e o de Elements renderiza o formulário
 * dentro do nosso app. Os dois criam a MESMA Checkout Session, então imposto,
 * cupom, endereço, CPF/CNPJ e idioma continuam sendo trabalho do Stripe, e o
 * webhook não distingue um do outro.
 */
type PedidoResolvido = {
  plan: 'starter' | 'pro';
  period: BillingPeriod;
  currency: Currency;
  price: Stripe.Price;
  user: typeof users.$inferSelect | null;
  lang: string;
};

async function resolverPedido(
  c: Context,
  body: CorpoCheckout
): Promise<{ erro: Response } | { pedido: PedidoResolvido }> {
  const plan = body.plan ?? '';
  if (!isPurchasable(plan)) {
    return {
      erro: c.json(
        { error: 'plan_not_purchasable', message: 'Só Starter e Pro são assinados pelo site.' },
        400
      ),
    };
  }

  const period: BillingPeriod = body.period === 'annual' ? 'annual' : 'monthly';

  // Conta é OPCIONAL aqui, de propósito. Quem ainda não tem compra direto: o
  // formulário coleta o e-mail e a conta nasce do pagamento confirmado. Exigir
  // cadastro antes de pagar põe um formulário no caminho de quem já decidiu.
  const user = body.userId
    ? (await db.select().from(users).where(eq(users.id, body.userId)).limit(1))[0] ?? null
    : null;
  if (body.userId && !user) return { erro: c.json({ error: 'user_not_found' }, 404) };

  // Moeda: o que o cliente já escolheu na página vence; senão, a localização.
  const detectada = detectCurrency(c);
  const pedida = body.currency?.toUpperCase();
  const currency: Currency = CURRENCIES.includes(pedida as Currency)
    ? (pedida as Currency)
    : detectada.currency;

  const chave = lookupKey(plan, period);
  const price = await precoPorLookupKey(chave);
  if (!price) {
    return {
      erro: c.json(
        {
          error: 'price_missing',
          message: 'Preço "' + chave + '" não existe no Stripe. Rode "pnpm --filter backend run stripe:setup".',
        },
        500
      ),
    };
  }

  return { pedido: { plan, period, currency, price, user, lang: body.lang ?? 'pt' } };
}

/**
 * Campos que os dois modos passam igual para `checkout.sessions.create`.
 *
 * Tudo que está aqui é recurso do Checkout que NÃO precisamos reimplementar ao
 * usar Elements — foi o motivo de escolher `ui_mode: 'elements'` em vez de
 * PaymentIntents cru: com PaymentIntents, cada uma destas linhas viraria tela.
 */
function camposComuns(
  pedido: PedidoResolvido,
  diasDeTeste: number | undefined,
  modo: 'hospedado' | 'elements'
) {
  const { plan, period, price, user } = pedido;
  return {
    mode: 'subscription' as const,
    line_items: [{ price: price.id, quantity: 1 }],
    currency: pedido.currency.toLowerCase(),

    billing_address_collection: 'required' as const,
    // `required` não existe em `ui_mode: 'elements'` — o Stripe recusa a
    // criação da sessão. Lá quem decide se o campo é obrigatório é o próprio
    // `TaxIdElement`, no nosso formulário; aqui basta ligar a coleta.
    // Só no hospedado. O `TaxIdElement` que renderizaria o campo em
    // `ui_mode: elements` está no preview do Stripe e não existe em runtime
    // (`createTaxIdElement is not a function`). Ligar a coleta sem ter onde
    // digitar não coleta nada — só mente no objeto da sessão.
    ...(modo === 'hospedado'
      ? { tax_id_collection: { enabled: true, required: 'if_supported' as const } }
      : {}),
    ...(IMPOSTO_AUTOMATICO ? { automatic_tax: { enabled: true } } : {}),
    allow_promotion_codes: true,
    locale: localeStripe(pedido.lang),

    ...(user ? { client_reference_id: user.id } : {}),
    metadata: { ...(user ? { userId: user.id } : {}), plan, period },
    subscription_data: {
      metadata: { ...(user ? { userId: user.id } : {}), plan },
      ...(diasDeTeste ? { trial_period_days: diasDeTeste } : {}),
    },
  };
}

billingRouter.post('/checkout', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as CorpoCheckout;

  const r = await resolverPedido(c, body);
  if ('erro' in r) return r.erro;
  const { pedido } = r;
  const { plan, currency, user, lang } = pedido;

  // Uma assinatura por conta. Trocar de plano é alterar a que existe, pelo
  // portal — abrir uma segunda ao lado cobra duas vezes, e foi o que acontecia
  // tanto no upgrade pelo Settings quanto em quem passava pelo checkout duas
  // vezes seguidas. A checagem mora aqui, e não na tela, porque a tela não é a
  // única forma de chegar nesta rota.
  if (user) {
    const jaTem = await assinaturaVigenteDe(user.id);
    if (jaTem) {
      return c.json(
        {
          error: 'subscription_exists',
          message:
            jaTem.plan === plan
              ? 'Esta conta já tem uma assinatura ativa deste plano.'
              : 'Esta conta já tem uma assinatura. Para trocar de plano, use o portal de cobrança — assim o valor é ajustado proporcionalmente em vez de gerar uma segunda cobrança.',
          currentPlan: jaTem.plan,
          currentStatus: jaTem.status,
          usePortal: true,
        },
        409
      );
    }
  }

  // Reusa o cliente do Stripe quando já existe, para o histórico de cobrança da
  // pessoa não se fragmentar em vários customers a cada compra.
  const customerId = user?.stripeCustomerId ?? null;

  // O teste é por pessoa, não por assinatura. Sem esta checagem, cancelar e
  // assinar de novo rende outro teste — indefinidamente, de graça, com custo
  // de LLM real a cada volta. Quem já teve uma assinatura aqui não ganha outro.
  const jaTeveTeste = user ? await usuarioJaTestou(user.id) : false;
  const diasDeTeste = jaTeveTeste ? undefined : PLAN_SPEC[plan].trialDays;

  const sessao = await stripe().checkout.sessions.create({
    ...camposComuns(pedido, diasDeTeste, 'hospedado'),

    ...(customerId
      ? {
          customer: customerId,
          // Deixa o Stripe gravar no customer o endereço e o nome que a pessoa
          // digitar agora, em vez de manter o cadastro velho.
          customer_update: { address: 'auto' as const, name: 'auto' as const },
        }
      // Em `mode: 'subscription'` o Stripe cria o customer sozinho — e recusa
      // `customer_creation`, que só existe em `mode: 'payment'`. Sem conta, o
      // Stripe pede o e-mail no próprio formulário — é dele que a conta nasce.
      // Com conta, adianta para não redigitar.
      : user ? { customer_email: user.email } : {}),

    // Página própria de boas-vindas, e não o painel: quem compra sem ter conta
    // chega aqui SEM sessão, e é essa página que troca a compra por um acesso e
    // pede a senha. Mandar direto para o painel devolveria a tela de login a
    // quem acabou de pagar.
    success_url: appUrl() + '/' + lang + '/bem-vindo?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: appUrl() + '/' + lang + '/pricing?checkout=cancelado',
  });

  return c.json({ url: sessao.url, sessionId: sessao.id, currency });
});

/**
 * Estado real de um checkout.
 *
 * A URL de retorno traz `?checkout=sucesso`, mas qualquer um digita isso na
 * barra de endereços. Uma confirmação que acredita no parâmetro estaria
 * mentindo para quem não pagou — e, pior, para quem pagou e o cartão foi
 * recusado depois. Aqui a resposta vem do Stripe.
 *
 * Também informa se o plano já mudou de fato: o webhook costuma chegar antes do
 * navegador voltar, mas não é garantido, e a tela precisa saber a diferença
 * entre "pago, ativando" e "pago e ativo".
 */
billingRouter.get('/session', async (c) => {
  const sessionId = c.req.query('session_id');
  const userId = await usuarioAtual(c);
  if (!sessionId) return c.json({ error: 'session_required' }, 400);

  const sessao = await stripe().checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'line_items'],
  });

  // A sessão pertence a quem está perguntando? O id já é impossível de adivinhar,
  // mas conferir evita a tela mostrar a compra de outra conta por engano.
  const dono = sessao.client_reference_id ?? sessao.metadata?.userId ?? null;
  if (userId && dono && dono !== userId) {
    return c.json({ error: 'not_yours' }, 403);
  }

  const pago = sessao.payment_status === 'paid' || sessao.payment_status === 'no_payment_required';
  const plano = normalizePlan(sessao.metadata?.plan);

  // `activated` = o webhook já rodou e o portão já libera. É isto, e não o
  // pagamento, que decide se a pessoa pode usar o recurso agora.
  let ativado = false;
  if (dono) {
    const linhas = await db.select({ plan: users.plan }).from(users).where(eq(users.id, dono)).limit(1);
    ativado = normalizePlan(linhas[0]?.plan) === plano;
  }

  const assinatura = typeof sessao.subscription === 'object' ? sessao.subscription : null;

  return c.json({
    paid: pago,
    status: sessao.status,
    paymentStatus: sessao.payment_status,
    plan: plano,
    planLabel: PLAN_SPEC[plano].label,
    activated: ativado,
    amountTotal: sessao.amount_total,
    currency: sessao.currency?.toUpperCase() ?? null,
    interval: sessao.metadata?.period === 'annual' ? 'year' : 'month',
    email: sessao.customer_details?.email ?? null,
    country: sessao.customer_details?.address?.country ?? null,
    renewsAt: assinatura ? fimDoPeriodo(assinatura)?.toISOString() ?? null : null,
    monthlyCredits: PLAN_SPEC[plano].monthlyCredits,
    // Quem acabou de sair do checkout num teste NÃO pagou e não tem a franquia
    // mensal. Dizer "1000 créditos por mês" na tela seguinte é prometer o que a
    // conta não recebeu — e o worker recusaria na primeira geração acima de 100.
    trialing: assinatura?.status === 'trialing',
    trialDays: PLAN_SPEC[plano].trialDays ?? null,
    trialCredits: PLAN_SPEC[plano].trialCredits ?? null,
  });
});


/**
 * Checkout com Elements: o formulário renderiza DENTRO do nosso app.
 *
 * Devolve o `client_secret` de uma Checkout Session com `ui_mode: 'elements'`,
 * e não uma URL. A sessão é a mesma dos outros modos — por isso o webhook, o
 * `sincronizarAssinatura` e a página de boas-vindas lendo `session_id` não
 * mudam em nada. O que muda é só quem desenha o formulário.
 */
billingRouter.post('/checkout/elements', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as CorpoCheckout;

  const r = await resolverPedido(c, body);
  if ('erro' in r) return r.erro;
  const { pedido } = r;
  const { plan, user, lang } = pedido;

  // Uma assinatura por conta. Trocar de plano é alterar a que existe, pelo
  // portal — abrir uma segunda ao lado cobra duas vezes, e foi o que acontecia
  // tanto no upgrade pelo Settings quanto em quem passava pelo checkout duas
  // vezes seguidas. A checagem mora aqui, e não na tela, porque a tela não é a
  // única forma de chegar nesta rota.
  if (user) {
    const jaTem = await assinaturaVigenteDe(user.id);
    if (jaTem) {
      return c.json(
        {
          error: 'subscription_exists',
          message:
            jaTem.plan === plan
              ? 'Esta conta já tem uma assinatura ativa deste plano.'
              : 'Esta conta já tem uma assinatura. Para trocar de plano, use o portal de cobrança — assim o valor é ajustado proporcionalmente em vez de gerar uma segunda cobrança.',
          currentPlan: jaTem.plan,
          currentStatus: jaTem.status,
          usePortal: true,
        },
        409
      );
    }
  }

  // Mesma regra do modo hospedado: teste é por pessoa, não por assinatura.
  const jaTeveTeste = user ? await usuarioJaTestou(user.id) : false;
  const diasDeTeste = jaTeveTeste ? undefined : PLAN_SPEC[plan].trialDays;

  const customerId = user?.stripeCustomerId ?? null;

  const sessao = await stripe().checkout.sessions.create({
    ...camposComuns(pedido, diasDeTeste, 'elements'),
    ui_mode: 'elements',

    // Adaptive Pricing: o Stripe identifica a região de quem está comprando
    // (por ML sobre sinais da requisição) e apresenta a moeda local, em 150+
    // países. Só existe em Elements com Checkout Sessions — não é suportado
    // com PaymentIntents cru, o que é mais um ponto para a arquitetura que
    // escolhemos.
    //
    // Não atropela nossa tabela: a conversão NÃO se aplica a moedas já
    // declaradas em `currency_options` do preço, e as nossas são BRL, USD e
    // EUR. Quem está nesses três paga o preço real, sem taxa de conversão;
    // o resto do mundo passa a ver a própria moeda em vez de BRL.
    //
    // Vale o alerta: a conversão embute 2–4% que o CLIENTE paga (nós pagamos
    // 0%). E o interruptor final é do Dashboard, em Payments settings.
    adaptive_pricing: { enabled: true },

    ...(customerId
      ? { customer: customerId, customer_update: { address: 'auto' as const, name: 'auto' as const } }
      // Sem conta, o e-mail vem do nosso próprio campo — o `ContactDetailsElement`
      // que o coletaria está no preview do Stripe e não existe em runtime. É
      // deste e-mail que a conta nasce no webhook, então ele não é opcional.
      : user
        ? { customer_email: user.email }
        : body.email
          ? { customer_email: body.email }
          : {}),

    // Em `ui_mode: 'elements'` não existem `success_url`/`cancel_url`: o Stripe
    // devolve o navegador para cá depois de qualquer redirecionamento de banco
    // (3DS, Pix). O destino é o mesmo do modo hospedado, então a tela de
    // boas-vindas serve os dois sem saber qual foi usado.
    return_url: appUrl() + '/' + lang + '/bem-vindo?session_id={CHECKOUT_SESSION_ID}',
  });

  if (!sessao.client_secret) {
    return c.json({ error: 'client_secret_missing' }, 500);
  }

  return c.json({
    clientSecret: sessao.client_secret,
    sessionId: sessao.id,
    currency: pedido.currency,
    // O front precisa disto para montar o Stripe.js. Não é segredo — é a chave
    // pública — mas é por ambiente, então sai do backend e não de um NEXT_PUBLIC
    // que sempre esquece de trocar entre teste e produção.
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    trialDays: diasDeTeste ?? null,
    trialCredits: diasDeTeste ? PLAN_SPEC[plan].trialCredits ?? null : null,
  });
});

// ------------------------------------------------------------------ portal

/**
 * Portal do Stripe: trocar cartão, ver faturas, cancelar.
 *
 * Construir essas telas seria refazer o que o Stripe já mantém — inclusive as
 * obrigações legais de cancelamento em cada país.
 */
billingRouter.post('/portal', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { lang?: string };

  /*
   * Quem é a pessoa quem diz é o cookie, não o corpo da requisição.
   *
   * Antes esta rota lia `body.userId` e abria o portal daquela conta sem
   * verificar nada. Quem soubesse um uuid — e uuid aparece em URL, em log, em
   * resposta de API — abria o portal de cobrança de outra pessoa: cartão
   * cadastrado, histórico de faturas e o botão de cancelar a assinatura dela.
   *
   * É o mesmo buraco que o `?userId=` abria no resto do app e que a
   * autenticação fechou. Esta rota tinha ficado para trás.
   */
  const userId = await usuarioAtual(c);
  if (!userId) return c.json(naoAutenticado(), 401);

  const encontrados = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = encontrados[0];
  if (!user?.stripeCustomerId) {
    return c.json(
      { error: 'no_customer', message: 'Esta conta ainda não tem histórico de cobrança.' },
      404
    );
  }

  const portal = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: appUrl() + '/' + (body.lang ?? 'pt') + '/dashboard',
  });

  return c.json({ url: portal.url });
});


// ----------------------------------------------------------------- webhook

/**
 * O que o Stripe conta sobre o pagamento.
 *
 * Esta rota é a única fonte de verdade para mudar `users.plan`. O sucesso do
 * redirect no navegador não serve: o cliente pode fechar a aba antes, e a URL
 * de sucesso é forjável por qualquer um que a digite.
 */
billingRouter.post('/webhook', async (c) => {
  const assinatura = c.req.header('stripe-signature');
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;

  if (!segredo) {
    console.error('[billing] STRIPE_WEBHOOK_SECRET ausente; webhook recusado.');
    return c.json({ error: 'webhook_not_configured' }, 503);
  }
  if (!assinatura) return c.json({ error: 'missing_signature' }, 400);

  // Corpo cru: qualquer reserialização muda os bytes e invalida a assinatura.
  const cru = await c.req.text();

  let evento: Stripe.Event;
  try {
    evento = stripe().webhooks.constructEvent(cru, assinatura, segredo);
  } catch (erro) {
    console.error('[billing] assinatura inválida:', erro instanceof Error ? erro.message : erro);
    return c.json({ error: 'invalid_signature' }, 400);
  }

  // O Stripe reentrega até receber 2xx — e também quando a resposta demora.
  // Sem esta trava, uma reentrega de `invoice.paid` recarregaria os créditos
  // do mês outra vez.
  const registrado = await db
    .insert(stripeEvents)
    .values({ id: evento.id, type: evento.type })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });

  if (registrado.length === 0) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    await processar(evento);
  } catch (erro) {
    // Solta a trava: sem isto a reentrega do Stripe seria descartada como
    // duplicata e o evento se perderia de vez.
    await db.delete(stripeEvents).where(eq(stripeEvents.id, evento.id));
    console.error('[billing] falha em ' + evento.type + ':', erro);
    // 500 faz o Stripe reentregar.
    return c.json({ error: 'processing_failed' }, 500);
  }

  return c.json({ received: true });
});

async function processar(evento: Stripe.Event): Promise<void> {
  switch (evento.type) {
    case 'checkout.session.completed': {
      await vincularCliente(evento.data.object as Stripe.Checkout.Session);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await sincronizarAssinatura(evento.data.object as Stripe.Subscription);
      break;
    }

    case 'invoice.paid': {
      await recarregarCreditos(evento.data.object as Stripe.Invoice);
      break;
    }

    case 'invoice.payment_failed': {
      const fatura = evento.data.object as Stripe.Invoice;
      // O rebaixamento não acontece aqui: o Stripe ainda vai tentar de novo, e
      // é o `subscription.updated` para `past_due`/`canceled` que decide.
      console.warn('[billing] pagamento falhou para o customer ' + String(fatura.customer));
      await avisarFalhaDePagamento(fatura);
      break;
    }

    default:
      break;
  }
}

/**
 * Guarda no usuário o customer, o país e o documento que ele confirmou — e
 * CRIA a conta quando a compra veio de alguém que ainda não tinha uma.
 *
 * Este é o caminho principal de entrada de cliente pagante: a pessoa escolhe o
 * plano, paga, e a conta nasce daqui. O e-mail vem do formulário do Stripe e
 * já chega comprovado por um pagamento aprovado — mais forte que o clique num
 * link de confirmação.
 */
async function vincularCliente(sessao: Stripe.Checkout.Session): Promise<void> {
  // O mesmo cuidado do `/from-checkout`: referência que não é UUID vale como
  // ausente, e a conta é encontrada pelo e-mail.
  const referencia = sessao.client_reference_id ?? sessao.metadata?.userId ?? null;
  let userId: string | null = pareceUuid(referencia) ? referencia : null;
  const emailDoStripe = sessao.customer_details?.email?.trim().toLowerCase() ?? null;

  if (!userId) {
    if (!emailDoStripe) {
      console.error('[billing] sessão sem conta e sem e-mail; não há como identificar o cliente.');
      return;
    }

    const existente = (await db.select().from(users).where(eq(users.email, emailDoStripe)).limit(1))[0];

    if (existente) {
      // Já era cliente e comprou de novo sem entrar. Mesma pessoa, mesma conta.
      userId = existente.id;
    } else {
      const [criado] = await db
        .insert(users)
        .values({
          email: emailDoStripe,
          name: sessao.customer_details?.name ?? null,
          // Pagamento aprovado prova o endereço: o Stripe não conclui a compra
          // com e-mail que a pessoa não controla.
          emailVerifiedAt: new Date(),
          plan: 'free',
          creditsBalance: PLAN_SPEC.free.monthlyCredits,
          // Comprar é aceitar os Termos, que estão no rodapé do checkout.
          acceptedTermsAt: new Date(),
        })
        .returning();
      userId = criado.id;
      console.log(`[billing] conta criada a partir do checkout: ${emailDoStripe}`);
    }

    // Registra por onde a pessoa entrou. Ainda não há senha — ela define uma
    // dentro do app, depois.
    await db
      .insert(identities)
      .values({ userId, provider: 'stripe', providerAccountId: emailDoStripe, email: emailDoStripe, lastUsedAt: new Date() })
      .onConflictDoNothing();
  }

  const customerId = typeof sessao.customer === 'string' ? sessao.customer : sessao.customer?.id;

  // O que o cliente digitou no checkout, não o que o IP sugeria.
  const pais = sessao.customer_details?.address?.country ?? null;
  const doc = sessao.customer_details?.tax_ids?.[0];

  await db
    .update(users)
    .set({
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(pais ? { billingCountry: pais } : {}),
      ...(doc?.value ? { taxId: doc.value, taxIdType: doc.type } : {}),
    })
    .where(eq(users.id, userId));
}

/** Espelha a assinatura e move `users.plan` — é o que os portões leem. */
export async function sincronizarAssinatura(sub: Stripe.Subscription): Promise<void> {
  const daMetadata = sub.metadata?.userId;
  const userId = pareceUuid(daMetadata) ? daMetadata : await userIdPorCustomer(sub.customer);
  if (!userId) {
    console.error('[billing] assinatura ' + sub.id + ' sem conta correspondente.');
    return;
  }

  const item = sub.items?.data?.[0];
  const plano = planoDaAssinatura(sub);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const dados = {
    userId,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customerId,
    plan: plano,
    status: sub.status,
    priceId: item?.price?.id ?? null,
    currency: item?.price?.currency ?? null,
    interval: item?.price?.recurring?.interval ?? null,
    currentPeriodEnd: fimDoPeriodo(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };

  // Precisa ser lido antes do upsert: é ele que diz se este evento é a ENTRADA
  // no teste ou só mais um `customer.subscription.updated` no meio dele. Sem a
  // distinção, cada evento recarregaria a franquia e o teste viraria infinito.
  const [anterior] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id))
    .limit(1);
  const entrandoNoTeste = sub.status === 'trialing' && anterior?.status !== 'trialing';

  await db
    .insert(subscriptions)
    .values(dados)
    .onConflictDoUpdate({ target: subscriptions.stripeSubscriptionId, set: dados });

  // Só `active` e `trialing` dão acesso pleno. `past_due` mantém o plano por
  // enquanto — o Stripe ainda está tentando cobrar, e cortar no primeiro erro
  // de cartão irrita quem só trocou de banco.
  const valendo = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';

  /*
   * Antes de rebaixar, olhar se há OUTRA assinatura viva nesta conta.
   *
   * A versão anterior decidia o plano só pela assinatura sendo sincronizada, e
   * o efeito apareceu ao cancelar uma duplicata: a conta caiu para `free` com o
   * outro teste ainda de pé no Stripe. Quem cancela uma de duas perde as duas.
   *
   * A regra de uma assinatura por conta torna isso raro daqui em diante, mas
   * raro não é nunca: quem já tinha duas antes da regra, ou quem troca de plano
   * numa janela em que as duas coexistem por instantes, cai exatamente aqui.
   */
  let outraViva: { plan: string } | null = null;
  if (!valendo) {
    const vizinhas = await db
      .select({ id: subscriptions.stripeSubscriptionId, plan: subscriptions.plan, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId));
    outraViva =
      vizinhas.find(
        (v) => v.id !== sub.id && ['trialing', 'active', 'past_due'].includes(v.status)
      ) ?? null;
    if (outraViva) {
      console.log(
        `[billing] ${userId}: ${sub.id} morreu, mas ${outraViva.plan} segue vivo em outra assinatura — plano mantido.`
      );
    }
  }

  const planoEfetivo: Plan = valendo
    ? plano
    : outraViva
      ? normalizePlan(outraViva.plan)
      : 'free';

  await db
    .update(users)
    .set({
      plan: planoEfetivo,
      // Vincula o customer aqui tambem, e nao so no `checkout.session.completed`.
      // O Stripe nao garante a ordem entre os dois eventos, e quando a fatura
      // chegava primeiro a recarga de creditos nao achava a conta e falhava
      // calada.
      stripeCustomerId: customerId,
      // Com outra viva, o prazo dela é que manda — não zeramos aqui; a
      // sincronização daquela assinatura já cuidou disso.
      ...(valendo
        ? { planValidUntil: comFolga(fimDoPeriodo(sub)) }
        : outraViva ? {} : { planValidUntil: null }),
      // Três casos distintos de saldo:
      //  - assinatura morta  -> zera (a franquia de `free` é zero).
      //  - entrando no teste -> concede a franquia do teste. O Stripe não emite
      //    fatura durante o trial, então a recarga de `invoice.paid` não vem, e
      //    sem isto a pessoa começaria o teste sem crédito nenhum.
      //  - já pagando        -> não mexe; quem recarrega é `invoice.paid`.
      ...(!valendo && !outraViva
        ? { creditsBalance: PLAN_SPEC.free.monthlyCredits }
        : entrandoNoTeste && PLAN_SPEC[plano].trialCredits !== undefined
          ? { creditsBalance: PLAN_SPEC[plano].trialCredits }
          : {}),
    })
    .where(eq(users.id, userId));

  console.log('[billing] ' + userId + ' -> ' + planoEfetivo + ' (assinatura ' + sub.status + ')');

  // Avisos por e-mail. `dedupeKey` amarrado ao evento, e não à data: o Stripe
  // reentrega, e sem isso o cliente receberia o mesmo aviso várias vezes.
  const [dono] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!dono) return;

  const valor = item?.price?.unit_amount != null
    ? `${(item.price.currency ?? 'brl').toUpperCase()} ${(item.price.unit_amount / 100).toFixed(2)}`
    : 'assinatura';
  const fim = fimDoPeriodo(sub);
  const dataFim = fim ? fim.toLocaleDateString('pt-BR') : null;

  if (sub.status === 'trialing') {
    // Nada foi cobrado ainda. O aviso tem de dizer isso, o prazo e a franquia —
    // é o e-mail que a pessoa vai procurar quando decidir se cancela.
    const t = tpl.testeIniciado(
      PLAN_SPEC[plano].label,
      PLAN_SPEC[plano].trialDays ?? 0,
      PLAN_SPEC[plano].trialCredits ?? 0,
      valor,
      dataFim
    );
    void enviarEmail({
      para: dono.email, template: 'teste_iniciado', userId,
      assunto: t.assunto, html: t.html, texto: t.texto,
      dedupeKey: `teste:${sub.id}`,
    });
  } else if (sub.status === 'active') {
    const t = tpl.assinaturaAtiva(PLAN_SPEC[plano].label, valor, dataFim);
    void enviarEmail({
      para: dono.email, template: 'assinatura_ativa', userId,
      assunto: t.assunto, html: t.html, texto: t.texto,
      dedupeKey: `ativa:${sub.id}:${item?.price?.id ?? ''}`,
    });
  } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
    const t = tpl.assinaturaCancelada(PLAN_SPEC[plano].label, dataFim);
    void enviarEmail({
      para: dono.email, template: 'assinatura_cancelada', userId,
      assunto: t.assunto, html: t.html, texto: t.texto,
      dedupeKey: `cancelada:${sub.id}`,
    });
  }
}

/** Recarrega a franquia do mês quando a fatura é paga. */
async function recarregarCreditos(fatura: Stripe.Invoice): Promise<void> {
  const userId = await userIdPorCustomer(fatura.customer);
  if (!userId) {
    // Silencio aqui era o pior caso possivel: a pessoa paga a renovacao e fica
    // sem creditos, sem nada no log para explicar. Falhar alto faz o Stripe
    // reentregar, e ai o vinculo ja existe.
    throw new Error(
      'invoice.paid sem conta correspondente para o customer ' + String(fatura.customer) +
      ' — recarga de creditos nao aplicada.'
    );
  }

  const encontrados = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const plano = normalizePlan(encontrados[0]?.plan);

  // Recarga, não acúmulo: o saldo volta à franquia do plano. Somar mês a mês
  // transformaria uma assinatura parada em crédito infinito.
  await db
    .update(users)
    .set({ creditsBalance: PLAN_SPEC[plano].monthlyCredits })
    .where(eq(users.id, userId));

  console.log('[billing] créditos de ' + userId + ' recarregados para ' + PLAN_SPEC[plano].monthlyCredits);
}

/**
 * Avisa que a cobrança foi recusada, com o caminho para trocar o cartão.
 *
 * Chega ANTES do corte: enquanto o Stripe repete a tentativa o acesso continua,
 * então o e-mail é a chance de resolver sem perder o serviço.
 */
async function avisarFalhaDePagamento(fatura: Stripe.Invoice): Promise<void> {
  const userId = await userIdPorCustomer(fatura.customer);
  if (!userId) return;

  const [dono] = await db
    .select({ email: users.email, customer: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!dono?.customer) return;

  let urlPortal = appUrl() + '/pt/dashboard/settings';
  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: dono.customer, return_url: urlPortal,
    });
    urlPortal = portal.url;
  } catch {
    // Sem portal configurado na conta, o link do painel já resolve.
  }

  const valor = fatura.amount_due != null
    ? `${(fatura.currency ?? 'brl').toUpperCase()} ${(fatura.amount_due / 100).toFixed(2)}`
    : 'sua assinatura';

  const t = tpl.pagamentoFalhou(valor, urlPortal);
  void enviarEmail({
    para: dono.email, template: 'pagamento_falhou', userId,
    assunto: t.assunto, html: t.html, texto: t.texto,
    dedupeKey: `falha:${fatura.id}`,
  });
}

async function userIdPorCustomer(customer: Stripe.Invoice['customer']): Promise<string | null> {
  const id = typeof customer === 'string' ? customer : customer?.id;
  if (!id) return null;

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, id))
    .limit(1);
  if (rows[0]?.id) return rows[0].id;

  // Segundo caminho: a assinatura ja registrou o customer mesmo que o usuario
  // ainda nao. Cobre a fatura que chega antes de qualquer outro evento.
  const porAssinatura = await db
    .select({ id: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, id))
    .limit(1);
  return porAssinatura[0]?.id ?? null;
}

/**
 * Fim do periodo pago mais uma folga.
 *
 * A folga existe porque a renovacao nao e instantanea: o Stripe cobra, tenta de
 * novo se falhar, e so entao avisa. Cortar o acesso no segundo exato do
 * vencimento derrubaria quem esta em dia por causa de uma repeticao de rede.
 */
const FOLGA_DIAS = 3;

function comFolga(fim: Date | null): Date | null {
  if (!fim) return null;
  return new Date(fim.getTime() + FOLGA_DIAS * 86400_000);
}

/**
 * Qual plano a assinatura concede.
 *
 * A metadata é o caminho normal. O `lookup_key` é a rede de segurança para
 * assinaturas criadas fora do nosso checkout — pelo painel do Stripe, por
 * exemplo — que não teriam metadata nenhuma.
 */
function planoDaAssinatura(sub: Stripe.Subscription): Plan {
  const daMetadata = sub.metadata?.plan;
  if (daMetadata && isPurchasable(daMetadata)) return daMetadata;

  const chave = sub.items?.data?.[0]?.price?.lookup_key ?? '';
  const m = /^skiller_(starter|pro)_/.exec(chave);
  if (m) return m[1] as Plan;

  console.warn('[billing] assinatura ' + sub.id + ' sem plano identificável; tratando como free.');
  return 'free';
}

/**
 * Até quando está pago.
 *
 * A partir da versão 2025-08 da API o `current_period_end` saiu do objeto da
 * assinatura e passou a viver em cada item. A leitura antiga fica como reserva
 * para eventos emitidos por versões anteriores.
 */
function fimDoPeriodo(sub: Stripe.Subscription): Date | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const legado = (sub as unknown as { current_period_end?: number }).current_period_end;
  const bruto = item?.current_period_end ?? legado;
  return typeof bruto === 'number' ? new Date(bruto * 1000) : null;
}

/** Idioma do checkout. O Stripe traduz a tela toda; só precisa do código certo. */
function localeStripe(lang: string | undefined): Stripe.Checkout.SessionCreateParams.Locale {
  switch (lang) {
    case 'pt': return 'pt-BR';
    case 'es': return 'es';
    case 'fr': return 'fr';
    case 'en': return 'en';
    default: return 'auto';
  }
}
