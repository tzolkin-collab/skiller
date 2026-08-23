'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import { Check, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

import DepthCarousel from '@/components/ui/DepthCarousel/DepthCarousel';
import {
  buscarCatalogo, criarCheckout, formatarValor,
  type Catalogo, type Currency as MoedaCobranca,
} from '@/lib/billing';
import type { Dictionary } from '@/types/dictionary';

type Currency = 'USD' | 'BRL' | 'EUR';
type BillingPeriod = 'monthly' | 'annual';

interface PricingClientProps {
  lang: string;
  dict: Dictionary;
}

export default function PricingClient({ lang, dict }: PricingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Mesma convenção do resto do painel enquanto não há sessão de verdade.
  // Conta vinda da sessao do painel, nao so da query string.
  const { userId } = useSession();

  const [currency, setCurrency] = useState<Currency>('USD');
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [assinando, setAssinando] = useState<string | null>(null);
  const [erroCobranca, setErroCobranca] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [activeIndex, setActiveIndex] = useState(0); 

  const copy = {
    eyebrow: dict.pricing.eyebrow,
    title: dict.pricing.title,
    titleAccent: 'Weapon',
    subtitle: dict.pricing.subtitle,
    free: dict.pricing.free,
    starter: dict.pricing.starter,
    pro: dict.pricing.pro,
    enterprise: dict.pricing.enterprise,
    select: dict.pricing.select,
    popular: dict.pricing.popular,
    monthly: dict.pricing.monthly,
    annual: dict.pricing.annual,
    save: dict.pricing.save,
    perMonth: dict.pricing.perMonth,
    perUser: dict.pricing.perUser,
    billedAnnually: dict.pricing.billedAnnually,
    foreverFree: dict.pricing.foreverFree,
    customPricing: dict.pricing.customPricing,
    contactSales: dict.pricing.contactSales,
    footerNote: dict.pricing.footerNote,
    redirecting: lang === 'pt' ? 'Abrindo checkout...' : 'Opening checkout...',
    contactUs: dict.pricing.contactUs,
    features: {
      free: dict.pricing.features.free,
      starter: dict.pricing.features.starter,
      pro: dict.pricing.features.pro,
      enterprise: dict.pricing.features.enterprise,
    },
    possibilities: {
      free: lang === 'pt' ? 'Comece a extrair e estruturar conhecimentos de forma básica. Ideal para experimentar a plataforma e criar suas primeiras skills sem compromisso.' : 'Start extracting and structuring knowledge basic level. Ideal to experience the platform and create your first skills with no commitment.',
      starter: lang === 'pt' ? 'Para criadores e desenvolvedores que precisam de mais volume. Acesse funcionalidades que começam a escalar sua produtividade e integrar inteligência aos seus fluxos.' : 'For creators and developers who need more volume. Access features that start to scale your productivity.',
      pro: lang === 'pt' ? 'O plano definitivo para profissionais de IA. Limites generosos, processamento rápido e integrações completas para criar agentes que realmente entendem o contexto e a linguagem de quem ensina.' : 'The definitive plan for AI professionals. Generous limits, fast processing, and full integrations.',
      enterprise: lang === 'pt' ? 'Para organizações e times que exigem escala, segurança e conformidade corporativa. Soluções customizadas, auditoria de segurança e suporte premium 24/7.' : 'For organizations and teams that require scale, security, and corporate compliance. Customized solutions, 24/7 premium support.'
    }
  };

  /**
   * Reserva para quando a cobranca nao esta configurada (o backend responde 503
   * sem STRIPE_SECRET_KEY). Em centavos, espelhando `backend/src/lib/plans.ts`.
   * Enquanto o catalogo carrega, e o que a pagina mostra.
   */
  const RESERVA: Record<Currency, { starterMonthly: number; starterAnnual: number; proMonthly: number; proAnnual: number; symbol: string }> = {
    USD: { starterMonthly: 990, starterAnnual: 9500, proMonthly: 1900, proAnnual: 18200, symbol: '$' },
    BRL: { starterMonthly: 4990, starterAnnual: 47900, proMonthly: 9999, proAnnual: 95900, symbol: 'R$' },
    EUR: { starterMonthly: 990, starterAnnual: 9500, proMonthly: 1900, proAnnual: 18200, symbol: '€' },
  };

  // A moeda vem da localizacao detectada no backend, nao de um default fixo:
  // brasileiro pagando em dolar toma IOF e spread sem perceber.
  useEffect(() => {
    let vivo = true;
    buscarCatalogo()
      .then((cat) => {
        if (!vivo) return;
        setCatalogo(cat);
        if (cat.detected) setCurrency(cat.currency);
      })
      .catch(() => {
        // Cobranca desligada neste ambiente. A pagina segue com a reserva.
      });
    return () => { vivo = false; };
  }, []);

  const simbolo = catalogo?.symbol ?? RESERVA[currency].symbol;

  /** Valor exibido, em centavos. `null` = sem preco de tabela. */
  const precoEmCentavos = useCallback(
    (planId: string): number | null => {
      const doCatalogo = catalogo?.plans.find((p) => p.id === planId);
      if (doCatalogo) {
        if (!doCatalogo.purchasable) return null;
        // No anual a pagina mostra o mensal equivalente; a cobranca e anual.
        return billing === 'annual'
          ? (doCatalogo.annualPerMonth ?? doCatalogo.monthly)
          : doCatalogo.monthly;
      }
      const r = RESERVA[currency];
      if (planId === 'starter') return billing === 'annual' ? Math.round(r.starterAnnual / 12) : r.starterMonthly;
      if (planId === 'pro') return billing === 'annual' ? Math.round(r.proAnnual / 12) : r.proMonthly;
      return null;
    },
    [catalogo, billing, currency]
  );

  /**
   * Manda para o checkout do Stripe.
   *
   * Sem usuario resolvido nao ha o que cobrar, entao cai no painel — o mesmo
   * destino de antes, para nao regredir quem chega deslogado.
   */
  /**
   * Abre o checkout do Stripe.
   *
   * Deslogado, manda criar conta LEVANDO A ESCOLHA JUNTO — plano e período vão
   * na URL de retorno, e o efeito abaixo retoma a compra assim que a sessão
   * existe. Antes isto empurrava para Configurações, que respondia "nenhuma
   * conta selecionada": a pessoa clicava em assinar e caía num beco.
   */
  const assinar = useCallback(async (plan: 'starter' | 'pro', period: BillingPeriod = billing) => {
    // Sem conta segue direto para o Stripe: é lá que o e-mail é coletado e a
    // conta nasce. Mandar criar cadastro aqui poria um formulário entre a
    // decisão de comprar e o pagamento.
    setErroCobranca(null);
    setAssinando(plan);
    try {
      const url = await criarCheckout({
        // `undefined` quando ninguém está logado — o backend aceita.
        userId: userId ?? undefined,
        plan,
        period,
        currency: (catalogo?.currency ?? currency) as MoedaCobranca,
        lang,
      });
      window.location.href = url;
    } catch (e) {
      setErroCobranca(e instanceof Error ? e.message : 'Nao foi possivel abrir o checkout.');
      setAssinando(null);
    }
  }, [userId, lang, router, catalogo, currency, billing]);

  /**
   * Retoma a compra depois do login.
   *
   * `retomado` impede o efeito de disparar duas vezes — abrir dois checkouts
   * criaria duas sessões no Stripe para a mesma intenção.
   */
  const [retomado, setRetomado] = useState(false);
  const planoPedido = searchParams.get('assinar');
  const periodoPedido = searchParams.get('periodo');

  useEffect(() => {
    if (retomado || !userId || !catalogo) return;
    if (planoPedido !== 'starter' && planoPedido !== 'pro') return;

    setRetomado(true);
    const p: BillingPeriod = periodoPedido === 'annual' ? 'annual' : 'monthly';
    setBilling(p);
    void assinar(planoPedido, p);
  }, [retomado, userId, catalogo, planoPedido, periodoPedido, assinar]);

  const plansData = [
    {
      id: 'free',
      name: copy.free,
      price: 0 as number | null,
      period: copy.perMonth,
      subtext: copy.foreverFree,
      features: copy.features.free,
      possibilityText: copy.possibilities.free,
      ctaText: copy.select,
      badge: null,
      cardClass: styles.card,
      nameClass: styles.planName,
      ctaClass: `${styles.ctaButton} ${styles.ctaSecondary}`,
      // A entrada e o teste de 7 dias do Starter, que o checkout ja monta com
      // `trial_period_days`. Antes este botao empurrava para o painel sem
      // assinatura nenhuma — e era por ali que se entrava no app de graca.
      action: () => assinar('starter'),
    },
    {
      id: 'starter',
      name: copy.starter,
      price: precoEmCentavos('starter'),
      period: copy.perMonth,
      subtext: copy.monthly,
      features: copy.features.starter,
      possibilityText: copy.possibilities.starter,
      ctaText: copy.select,
      badge: null,
      cardClass: styles.card,
      nameClass: styles.planName,
      ctaClass: `${styles.ctaButton} ${styles.ctaSecondary}`,
      action: () => assinar('starter'),
    },
    {
      id: 'pro',
      name: copy.pro,
      price: precoEmCentavos('pro'),
      period: copy.perMonth,
      subtext: billing === 'annual' ? copy.billedAnnually : ' ',
      features: copy.features.pro,
      possibilityText: copy.possibilities.pro,
      ctaText: copy.select,
      badge: copy.popular,
      cardClass: `${styles.card} ${styles.pro}`,
      nameClass: `${styles.planName} ${styles.planNamePro}`,
      ctaClass: `${styles.ctaButton} ${styles.ctaPrimary}`,
      action: () => assinar('pro'),
    },
    {
      id: 'enterprise',
      name: copy.enterprise,
      price: null,
      period: copy.perMonth + ' ' + copy.perUser,
      subtext: copy.billedAnnually ? (billing === 'annual' ? copy.billedAnnually : ' ') : ' ',
      features: copy.features.enterprise,
      possibilityText: copy.possibilities.enterprise,
      ctaText: copy.contactSales,
      badge: null,
      cardClass: `${styles.card} ${styles.enterprise}`,
      nameClass: `${styles.planName} ${styles.planNameEnterprise}`,
      ctaClass: `${styles.ctaButton} ${styles.ctaSecondary} ${styles.enterpriseBtn}`,
      action: () => router.push(`/${lang}/contact`),
    },
  ];

  const activePlanData = plansData[activeIndex] || plansData[0];

  const renderCardContent = (plan: typeof plansData[0]) => (
    <div key={plan.id} className={plan.cardClass} style={{ width: '100%', height: '100%', boxShadow: 'none' }}>
      {plan.badge ? <span className={styles.popularBadge}>{plan.badge}</span> : null}
      <div className={plan.nameClass}>{plan.name}</div>
      <div className={styles.planPriceRow}>
        {plan.price !== null ? (
          <>
            <span className={styles.priceCurrency}>{simbolo}</span>
            <span className={styles.priceValue}>{formatarValor(plan.price, lang)}</span>
            <span className={styles.pricePeriod}>{plan.period}</span>
          </>
        ) : (
          <span className={styles.priceValue} style={{ fontSize: '32px' }}>{copy.customPricing}</span>
        )}
      </div>
      <div className={styles.priceSubtext}>{plan.subtext}</div>

      <div className={styles.divider} />

      <div className={styles.planFeatures}>
        {plan.features.map((feat, i) => (
          <div key={i} className={styles.feature}>
            <Check size={16} className={styles.featureIcon} />
            <span>{feat}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={styles.pageContainer}>
      <div className={styles.container}>
        
        {/* Header: Toggle ONLY */}
        <div className={styles.header}>
          <div className={styles.billingToggle}>
            <button
              className={`${styles.billingOption} ${billing === 'monthly' ? styles.active : ''}`}
              onClick={() => setBilling('monthly')}
            >
              {copy.monthly}
            </button>
            <button
              className={`${styles.billingOption} ${billing === 'annual' ? styles.active : ''}`}
              onClick={() => setBilling('annual')}
            >
              <span>{copy.annual}</span>
              <span className={styles.saveBadge}>{copy.save}</span>
            </button>
          </div>
        </div>

        {/* Desktop Split Layout */}
        <div className={styles.desktopSplitLayout}>
          <div className={styles.leftColumn}>
            <div key={activePlanData.id} className={styles.valuePropContainer}>
              <h2 className={styles.valuePropTitle}>{activePlanData.name}</h2>
              <p className={styles.valuePropText}>{activePlanData.possibilityText}</p>
              
              <button
                className={activePlanData.ctaClass}
                onClick={activePlanData.action}
                disabled={assinando !== null}
              >
                <span>{assinando === activePlanData.id ? copy.redirecting : activePlanData.ctaText}</span>
                <ArrowRight size={14} className={styles.arrowIcon} />
              </button>
              {erroCobranca ? <p className={styles.priceSubtext}>{erroCobranca}</p> : null}
            </div>
          </div>
          <div className={styles.rightColumn}>
            <div className={styles.carouselWrapper}>
              <DepthCarousel
                items={plansData}
                renderItem={(item) => renderCardContent(item)}
                autoplay={false}
                loop={false}
                visibleCards={3}
                cardWidth={340}
                cardHeight={480}
                captureGlobalScroll={true}
                onChange={(idx) => setActiveIndex(idx)}
              />
            </div>
          </div>
        </div>

        {/* Mobile Stacked Layout */}
        <div className={styles.mobileStackedLayout}>
          {plansData.map((plan) => (
            <div key={plan.id} className={styles.mobileCardWrapper} style={{ marginBottom: '24px' }}>
              {renderCardContent(plan)}
              <div className={styles.mobileValueProp} style={{ marginTop: '16px', textAlign: 'center' }}>
                <p className={styles.valuePropText}>{plan.possibilityText}</p>
                <button className={plan.ctaClass} onClick={plan.action} disabled={assinando !== null}>
                  <span>{assinando === plan.id ? copy.redirecting : plan.ctaText}</span>
                  <ArrowRight size={14} className={styles.arrowIcon} />
                </button>
                {erroCobranca ? <p className={styles.priceSubtext}>{erroCobranca}</p> : null}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className={styles.footerNote}>
          <p className={styles.footerText}>
            <span>{copy.footerNote} </span>
            <a href={`/${lang}/contact`} className={styles.footerLink}>
              {copy.contactUs} →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
