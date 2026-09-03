/**
 * Fallback de sincronização quando o webhook não chegou.
 *
 * Duas estratégias em cascata:
 * 1. Por stripeCustomerId — caminho normal pós-checkout.
 * 2. Por metadata.userId — cobre o caso em que checkout.session.completed
 *    também não rodou (customerId nunca foi gravado no banco).
 *
 * Idempotente: chamar duas vezes tem o mesmo efeito que uma.
 */
import type Stripe from 'stripe';
import { stripe, isStripeConfigured } from './stripe.js';
import { sincronizarAssinatura } from '../routes/billing.js';

const ATIVOS = ['trialing', 'active', 'past_due'] as const;

function viva(sub: Stripe.Subscription): boolean {
  return (ATIVOS as readonly string[]).includes(sub.status);
}

/**
 * Tenta sincronizar a assinatura mais recente e ativa do usuário.
 *
 * Retorna `true` se encontrou e sincronizou algo, `false` caso contrário.
 * Nunca lança — falhas são logadas e engolidas para não bloquear a request.
 */
export async function tentarSincronizarStripe(opts: {
  userId: string;
  stripeCustomerId: string | null;
}): Promise<boolean> {
  if (!isStripeConfigured()) return false;

  try {
    let sub: Stripe.Subscription | null = null;

    // Via 1: customer já vinculado
    if (opts.stripeCustomerId) {
      const lista = await stripe().subscriptions.list({
        customer: opts.stripeCustomerId,
        status: 'all',
        limit: 5,
        expand: ['data.items.data.price'],
      });
      sub = lista.data.find(viva) ?? null;
    }

    // Via 2: busca pela metadata que o checkout gravou na assinatura
    if (!sub) {
      const busca = await stripe().subscriptions.search({
        query: `metadata['userId']:'${opts.userId}'`,
        limit: 5,
        expand: ['data.items.data.price'],
      });
      sub = busca.data.find(viva) ?? null;
    }

    if (!sub) return false;

    await sincronizarAssinatura(sub);
    return true;
  } catch (e) {
    console.warn('[stripe-sync] fallback falhou:', e instanceof Error ? e.message : e);
    return false;
  }
}
