import { BASE_URL } from '@/lib/api-base';
/**
 * Cobrança, do lado do navegador.
 *
 * Os preços não vivem mais aqui: vêm de `/api/billing/pricing`, já na moeda de
 * quem abriu a página. Manter a tabela nos dois lados foi o que fez o site
 * anunciar R$97 enquanto o backend cobrava R$99,99.
 */


export type Currency = 'BRL' | 'USD' | 'EUR';
export type BillingPeriod = 'monthly' | 'annual';

export interface PlanoCobravel {
  id: string;
  label: string;
  capabilities: string[];
  monthlyCredits: number;
  members: number;
  purchasable: boolean;
  /** Período de teste do plano, quando existe. `null` quando não há. */
  trialDays: number | null;
  /** Franquia liberada durante o teste — menor que a mensal, de propósito. */
  trialCredits: number | null;
  /** Em centavos da moeda. `null` em Free e Enterprise. */
  monthly: number | null;
  annual: number | null;
  annualPerMonth?: number;
  savingsPercent?: number;
}

export interface Catalogo {
  currency: Currency;
  symbol: string;
  country: string | null;
  /** `true` quando a moeda veio da localização e não de escolha explícita. */
  detected: boolean;
  plans: PlanoCobravel[];
}

/**
 * Catálogo na moeda certa.
 *
 * O país sai dos cabeçalhos da própria request, no backend — sem pedir
 * permissão de GPS ao navegador, que seria intrusivo e nem responderia a tempo
 * de pintar a primeira tela.
 */
export async function buscarCatalogo(currency?: Currency): Promise<Catalogo> {
  const q = currency ? '?currency=' + currency : '';
  const res = await fetch(BASE_URL + '/api/billing/pricing' + q);
  if (!res.ok) throw new Error('billing_unavailable');
  return res.json();
}

export interface PedidoCheckout {
  /** Ausente quando ninguém está logado: o Stripe coleta o e-mail e a conta
   *  nasce do pagamento. */
  userId?: string;
  plan: 'starter' | 'pro';
  period: BillingPeriod;
  currency: Currency;
  lang: string;
  /** Só o modo Elements usa: e-mail de quem compra sem ter conta. */
  email?: string;
}

/**
 * Abre o checkout do Stripe.
 *
 * Devolve a URL em vez de navegar sozinha, para quem chama decidir o que fazer
 * enquanto espera — normalmente travar o botão.
 */
export async function criarCheckout(pedido: PedidoCheckout): Promise<string> {
  const res = await fetch(BASE_URL + '/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
  });

  const dados = await res.json().catch(() => ({}));
  if (!res.ok || !dados.url) {
    throw new Error(dados.message ?? dados.error ?? 'Não foi possível abrir o checkout.');
  }
  return dados.url as string;
}

/** O que o backend devolve para montar o formulário dentro do app. */
export interface SessaoElements {
  clientSecret: string;
  sessionId: string;
  currency: Currency;
  /** Chave pública do Stripe, por ambiente. Vem do backend de propósito. */
  publishableKey: string;
  trialDays: number | null;
  trialCredits: number | null;
}

/**
 * Abre o checkout com Elements — o formulário fica dentro do nosso app.
 *
 * É a mesma Checkout Session do modo hospedado, só que devolvendo um segredo
 * em vez de uma URL. Por isso o webhook e a tela de boas-vindas não sabem nem
 * precisam saber qual dos dois foi usado.
 */
export async function criarCheckoutElements(pedido: PedidoCheckout): Promise<SessaoElements> {
  const res = await fetch(BASE_URL + '/api/billing/checkout/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
  });

  const dados = await res.json().catch(() => ({}));
  if (!res.ok || !dados.clientSecret) {
    throw new Error(dados.message ?? dados.error ?? 'Não foi possível abrir o checkout.');
  }
  return dados as SessaoElements;
}

/**
 * Portal do Stripe: cartão, faturas, cancelamento.
 *
 * Não recebe `userId`: quem identifica a pessoa é o cookie, no backend. A
 * versão anterior mandava o id no corpo e a rota confiava nele — quem soubesse
 * um uuid abria o portal de cobrança de outra conta.
 */
export async function abrirPortal(lang: string): Promise<string> {
  const res = await fetch(BASE_URL + '/api/billing/portal', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang }),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok || !dados.url) {
    throw new Error(dados.message ?? 'Esta conta ainda não tem histórico de cobrança.');
  }
  return dados.url as string;
}

/**
 * Centavos para o número que aparece na página.
 *
 * Sem o símbolo: o layout já o desenha num `<span>` separado. Valor redondo sai
 * inteiro (`19`), quebrado sai com as duas casas (`99,99`) — antes o `49.90`
 * cru do JavaScript aparecia como `49.9`.
 */
export function formatarValor(centavos: number, lang: string): string {
  const valor = centavos / 100;
  const casas = Number.isInteger(valor) ? 0 : 2;
  return new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : lang, {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

/** O que o Stripe diz sobre um checkout, conferido no servidor. */
export interface ConfirmacaoCheckout {
  paid: boolean;
  status: string | null;
  paymentStatus: string | null;
  plan: string;
  planLabel: string;
  /** O webhook já rodou e o portão já libera. Pago não é o mesmo que ativo. */
  activated: boolean;
  amountTotal: number | null;
  currency: string | null;
  interval: string;
  email: string | null;
  country: string | null;
  renewsAt: string | null;
  monthlyCredits: number;
  /** Saiu do checkout em teste — não houve cobrança. */
  trialing: boolean;
  trialDays: number | null;
  trialCredits: number | null;
}

/**
 * Confirma um pagamento.
 *
 * Não confia no `?checkout=sucesso` da URL — qualquer um digita aquilo. Quem
 * responde é o Stripe, via nosso backend.
 */
export async function confirmarCheckout(sessionId: string, userId?: string | null): Promise<ConfirmacaoCheckout> {
  const q = new URLSearchParams({ session_id: sessionId });
  // A conta sai do cookie; o id na query so o expunha em URL e log.
  const res = await fetch(BASE_URL + '/api/billing/session?' + q.toString());
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message ?? d.error ?? 'Não foi possível confirmar o pagamento.');
  }
  return res.json();
}

/**
 * Nome legivel de cada capacidade.
 *
 * A aba de Plano mostrava tres beneficios fixos vindos do dicionario, iguais
 * para todos os planos. Aqui a lista sai do que o backend realmente libera, que
 * e a mesma fonte que os portoes consultam.
 */
export const ROTULO_CAPACIDADE: Record<string, { pt: string; en: string }> = {
  'skill.generate':  { pt: 'Gerar skills a partir de vídeos',      en: 'Generate skills from videos' },
  'skill.test':      { pt: 'Testar a skill antes de usar',         en: 'Test the skill before using it' },
  'skill.export':    { pt: 'Baixar o pacote gerado',               en: 'Download the generated package' },
  'skill.edit':      { pt: 'Editar e refinar a skill',             en: 'Edit and refine the skill' },
  'connectors.mcp':  { pt: 'Conectar sua IDE pelo MCP',            en: 'Connect your IDE over MCP' },
  'kb':              { pt: 'Base da IA — memória entre sessões',   en: 'AI Base — memory across sessions' },
  'projects.shared': { pt: 'Projects compartilhados',              en: 'Shared projects' },
};

export function rotuloCapacidade(cap: string, lang: string): string {
  const r = ROTULO_CAPACIDADE[cap];
  if (!r) return cap;
  return lang === 'pt' ? r.pt : r.en;
}
