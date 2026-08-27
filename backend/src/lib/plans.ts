/**
 * Fonte única do que cada plano libera.
 *
 * A coluna `users.plan` existia e nunca era lida — a tela de Settings mostrava
 * "Starter" chumbado no HTML. Este módulo é o que faz o plano significar algo.
 *
 * Divisão de responsabilidade: o **plano** decide o que a pessoa PODE fazer;
 * os **créditos** (`users.creditsBalance`, que o worker já debita) medem quanto
 * ela já fez. Não são dois sistemas — o plano define a recarga mensal.
 */

export type Plan = 'free' | 'starter' | 'pro' | 'enterprise';

export const PLANS: Plan[] = ['free', 'starter', 'pro', 'enterprise'];

/**
 * Capacidades nomeadas. Preferir isto a comparar strings de plano espalhadas
 * pelo código: quando a fronteira comercial mudar — e ela vai — muda aqui.
 */
export type Capability =
  /** Gerar skill a partir de uma fonte. */
  | 'skill.generate'
  /** Rodar a bateria de perguntas-sonda e ver o diff antes/depois. */
  | 'skill.test'
  /** Baixar o pacote gerado. */
  | 'skill.export'
  /** Editar e refinar a skill depois de gerada. */
  | 'skill.edit'
  /** Conectar o MCP do Skiller a uma IDE ou cliente de IA. */
  | 'connectors.mcp'
  /** Base da IA — a wiki online, lida e escrita pelos agentes. */
  | 'kb'
  /** Projects compartilhados entre contas. */
  | 'projects.shared';

interface PlanSpec {
  label: string;
  /** Em centavos de real, para não carregar float. `null` = sob consulta. */
  priceCents: number | null;
  capabilities: Capability[];
  /** Recarga mensal de créditos. */
  monthlyCredits: number;
  /**
   * Franquia do período de teste, quando o plano oferece um.
   *
   * Não é a mensal: durante o teste o Stripe não emite fatura, então a recarga
   * de `invoice.paid` nunca dispara. Sem um número próprio aqui, quem entra no
   * teste fica com o saldo que já tinha — zero — e não consegue usar nada.
   */
  trialDays?: number;
  trialCredits?: number;
  /** Quantas pessoas cabem na conta. */
  members: number;
}

export const PLAN_SPEC: Record<Plan, PlanSpec> = {
  free: {
    label: 'Sem plano ativo',
    priceCents: 0,
    // `free` NAO e um tier: e a ausencia de assinatura valida. Cai aqui quem
    // nunca comecou o teste, quem cancelou dentro do prazo, e quem deixou a
    // assinatura vencer. Nenhum deles deve conseguir usar o produto.
    //
    // A porta de entrada e o teste do Starter, com cartao — os dias e a franquia
    // sao `trialDays`/`trialCredits` logo abaixo, e nao literais soltos. Durante
    // o teste o Stripe reporta `trialing`, e o webhook grava `plan: 'starter'`,
    // entao as capacidades vem de la, nao daqui.
    capabilities: [],
    monthlyCredits: 0,
    members: 1,
  },
  starter: {
    label: 'Starter',
    priceCents: 4990,
    capabilities: ['skill.generate', 'skill.test', 'skill.export', 'skill.edit', 'connectors.mcp'],
    monthlyCredits: 1000,
    // Teste de 3 dias com franquia reduzida. 300 créditos ≈ 23 vídeos: o
    // bastante para processar uma playlist real e ver o produto funcionando,
    // ao custo máximo de R$3 de API por pessoa (markup 5x sobre ~R$0,134/vídeo).
    // A 100 créditos o teste parava em 7 vídeos e não completava nem uma
    // playlist curta — demonstrava a interface, não o resultado.
    // Estes dois números são a única fonte: `routes/billing.ts` monta o
    // `trial_period_days` a partir daqui e a página de preços lê via catálogo.
    trialDays: 3,
    trialCredits: 300,
    members: 1,
  },
  pro: {
    label: 'Pro',
    priceCents: 9999,
    // A fronteira Starter → Pro não é volume, é natureza: Starter gera
    // artefatos que o usuário leva embora; Pro guarda conhecimento que fica.
    capabilities: [
      'skill.generate', 'skill.test', 'skill.export', 'skill.edit',
      'connectors.mcp', 'kb', 'projects.shared',
    ],
    monthlyCredits: 3000,
    members: 1,
  },
  enterprise: {
    label: 'Enterprise Suite',
    priceCents: null,
    capabilities: [
      'skill.generate', 'skill.test', 'skill.export', 'skill.edit',
      'connectors.mcp', 'kb', 'projects.shared',
    ],
    monthlyCredits: 20000,
    members: 25,
  },
};

/** Normaliza o que vier do banco; plano desconhecido cai no mais restrito. */
export function normalizePlan(raw: string | null | undefined): Plan {
  return PLANS.includes(raw as Plan) ? (raw as Plan) : 'free';
}

export function can(plan: string | null | undefined, cap: Capability): boolean {
  return PLAN_SPEC[normalizePlan(plan)].capabilities.includes(cap);
}

/** Menor plano que libera a capacidade — para a mensagem dizer o que comprar. */
export function requiredPlan(cap: Capability): Plan {
  return PLANS.find((p) => PLAN_SPEC[p].capabilities.includes(cap)) ?? 'enterprise';
}

/**
 * Mensagem de bloqueio. Dita para o agente, não para o desenvolvedor: quem lê
 * é o LLM que vai repassar ao usuário, então precisa dizer o que fazer.
 */
export function upgradeMessage(cap: Capability, plan: string | null | undefined): string {
  const alvo = PLAN_SPEC[requiredPlan(cap)];
  const atual = PLAN_SPEC[normalizePlan(plan)];
  const preco = alvo.priceCents === null
    ? 'sob consulta'
    : `R$ ${(alvo.priceCents / 100).toFixed(2).replace('.', ',')}/mês`;

  return `Este recurso faz parte do plano ${alvo.label} (${preco}). A conta está no ${atual.label}.`;
}

/**
 * Moedas suportadas na cobrança. A escolha não é do usuário: vem da localização
 * dele. Um cartão brasileiro pagando em dólar toma IOF e spread do emissor, e o
 * Pix só existe em BRL — então errar a moeda encarece a compra de verdade.
 */
export type Currency = 'BRL' | 'USD' | 'EUR';
export const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR'];
export const CURRENCY_SYMBOL: Record<Currency, string> = { BRL: 'R$', USD: '$', EUR: '€' };

export type BillingPeriod = 'monthly' | 'annual';

/**
 * Tabela de preços, em centavos da própria moeda.
 *
 * Antes isto vivia duplicado: `PricingClient.tsx` dizia R$97 e a mensagem de
 * bloqueio do MCP dizia R$99,99 — o cliente ouvia um preço do agente e via
 * outro no site. O card Enterprise ainda mostrava o preço do Pro por reuso de
 * variável. Agora existe uma tabela só, e o Stripe é provisionado a partir dela.
 *
 * O anual é cobrado de uma vez; o valor abaixo é o do ANO inteiro, não o mensal
 * equivalente — a página divide por 12 para exibir.
 */
export const PRICING: Record<'starter' | 'pro', Record<BillingPeriod, Record<Currency, number>>> = {
  starter: {
    monthly: { BRL: 4990, USD: 990, EUR: 990 },
    annual: { BRL: 47900, USD: 9500, EUR: 9500 },
  },
  pro: {
    monthly: { BRL: 9999, USD: 1900, EUR: 1900 },
    annual: { BRL: 95900, USD: 18200, EUR: 18200 },
  },
};

/**
 * Chave estável do preço no Stripe. É por ela que o backend acha o preço, nunca
 * por um `price_xxx` chumbado em env: assim recriar o catálogo não quebra o app.
 */
export function lookupKey(plan: 'starter' | 'pro', period: BillingPeriod): string {
  return `skiller_${plan}_${period}`;
}

/** País (ISO-3166 alpha-2) para a moeda em que faz sentido cobrar. */
export function currencyForCountry(country: string | null | undefined): Currency {
  const c = (country ?? '').toUpperCase();
  if (c === 'BR') return 'BRL';
  if (EUROZONE.has(c)) return 'EUR';
  return 'USD';
}

const EUROZONE = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
]);

/** Planos que se compra sozinho. Free não cobra; Enterprise passa por vendas. */
export const PAID_PLANS: ('starter' | 'pro')[] = ['starter', 'pro'];

export function isPurchasable(plan: string): plan is 'starter' | 'pro' {
  return plan === 'starter' || plan === 'pro';
}
