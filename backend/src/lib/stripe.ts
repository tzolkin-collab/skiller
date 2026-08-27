/**
 * O cliente Stripe.
 *
 * Inicialização preguiçosa e opcional: sem `STRIPE_SECRET_KEY` o backend sobe
 * normalmente e só as rotas de cobrança respondem 503. O contrário — derrubar o
 * servidor inteiro porque falta uma chave de pagamento — deixaria o
 * desenvolvimento local refém de credencial de produção.
 */
import Stripe from 'stripe';

let cliente: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY ausente: cobrança desativada neste ambiente.');
  }
  if (!cliente) {
    cliente = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Fixar a versão evita que uma mudança na API do Stripe altere o formato
      // dos webhooks sem que ninguém tenha mexido no código.
      apiVersion: '2026-07-29.dahlia',
      appInfo: { name: 'Skiller', url: 'https://skiller.ai' },
      // O Stripe já repete em falha de rede; três tentativas cobrem o transitório
      // sem segurar a request do usuário por muito tempo.
      maxNetworkRetries: 3,
      // Permite apontar o SDK para um servidor falso (stripe-mock ou o nosso
      // `billing-mock`). Existe porque, sem isto, nenhum caminho que fale com o
      // Stripe pode ser exercitado sem uma conta — e o código de pagamento é
      // justamente o que não pode ir para produção sem teste.
      ...baseAlternativa(),
    });
  }
  return cliente;
}

/** Chave pública, para o front montar o link sem embutir segredo. */
export function publishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY ?? null;
}

/**
 * Base das URLs de retorno. O Stripe redireciona o navegador para cá depois do
 * pagamento, então precisa ser a URL que o usuário enxerga — não a do backend.
 */
export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Redireciona o SDK quando `STRIPE_API_BASE` aponta para outro endereço.
 * Vazio em produção — lá o SDK fala com o Stripe de verdade.
 */
function baseAlternativa(): { host?: string; port?: number; protocol?: 'http' | 'https' } {
  const bruto = process.env.STRIPE_API_BASE;
  if (!bruto) return {};
  const u = new URL(bruto);
  return {
    host: u.hostname,
    port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80),
    protocol: u.protocol === 'https:' ? 'https' : 'http',
  };
}
