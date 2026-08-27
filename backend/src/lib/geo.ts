/**
 * De onde o cliente está comprando.
 *
 * Serve para escolher a moeda ANTES do checkout: quem está no Brasil vê R$ e
 * ganha Pix; quem está fora vê a moeda de casa. Não é decisão de segurança e
 * não precisa ser exata — é um palpite bom o suficiente para pré-preencher, e
 * o cliente confirma o país no próprio checkout do Stripe.
 */
import type { Context } from 'hono';
import { type Currency, currencyForCountry } from './plans.js';

/**
 * Cabeçalhos de país que as bordas comuns injetam. A ordem é de mais confiável
 * para menos: os três primeiros vêm da infraestrutura e o cliente não consegue
 * forjá-los; `accept-language` vem do navegador e é só o último recurso.
 */
const HEADERS_DE_PAIS = [
  'cf-ipcountry',        // Cloudflare
  'x-vercel-ip-country', // Vercel
  'x-appengine-country', // Google Cloud
  'x-country-code',
];

/** País ISO-3166 alpha-2, ou null quando nada na request revela. */
export function detectCountry(c: Context): string | null {
  for (const h of HEADERS_DE_PAIS) {
    const v = c.req.header(h);
    // A Cloudflare manda "XX" quando não sabe, e "T1" para tráfego Tor.
    if (v && v.length === 2 && v !== 'XX' && v !== 'T1') return v.toUpperCase();
  }

  // Último recurso: a região do idioma preferido. `pt-BR` → BR.
  const idioma = c.req.header('accept-language');
  const regiao = idioma?.match(/[a-z]{2,3}-([A-Z]{2})/)?.[1];
  return regiao ?? null;
}

/** Moeda em que faz sentido cobrar quem está fazendo esta request. */
export function detectCurrency(c: Context): { currency: Currency; country: string | null } {
  const country = detectCountry(c);
  return { currency: currencyForCountry(country), country };
}
