'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

import DepthCarousel from '@/components/ui/DepthCarousel/DepthCarousel';
import type { Dictionary } from '@/types/dictionary';

type Currency = 'USD' | 'BRL' | 'EUR';
type BillingPeriod = 'monthly' | 'annual';

interface PricingClientProps {
  lang: string;
  dict: Dictionary;
}

export default function PricingClient({ lang, dict }: PricingClientProps) {
  const router = useRouter();
  const [currency, setCurrency] = useState<Currency>('USD');
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

  const prices: Record<Currency, { free: number; starter: number; proMonthly: number; proAnnual: number; symbol: string }> = {
    USD: { free: 0, starter: 9.90, proMonthly: 19, proAnnual: 15, symbol: '$' },
    BRL: { free: 0, starter: 49.90, proMonthly: 97, proAnnual: 77, symbol: 'R$' },
    EUR: { free: 0, starter: 9.90, proMonthly: 19, proAnnual: 15, symbol: '€' },
  };

  const plansData = [
    {
      id: 'free',
      name: copy.free,
      price: prices[currency].free,
      period: copy.perMonth,
      subtext: copy.foreverFree,
      features: copy.features.free,
      possibilityText: copy.possibilities.free,
      ctaText: copy.select,
      badge: null,
      cardClass: styles.card,
      nameClass: styles.planName,
      ctaClass: `${styles.ctaButton} ${styles.ctaSecondary}`,
      action: () => router.push(`/${lang}/dashboard`),
    },
    {
      id: 'starter',
      name: copy.starter,
      price: prices[currency].starter,
      period: copy.perMonth,
      subtext: copy.monthly,
      features: copy.features.starter,
      possibilityText: copy.possibilities.starter,
      ctaText: copy.select,
      badge: null,
      cardClass: styles.card,
      nameClass: styles.planName,
      ctaClass: `${styles.ctaButton} ${styles.ctaSecondary}`,
      action: () => router.push(`/${lang}/dashboard`),
    },
    {
      id: 'pro',
      name: copy.pro,
      price: billing === 'monthly' ? prices[currency].proMonthly : prices[currency].proAnnual,
      period: copy.perMonth,
      subtext: billing === 'annual' ? copy.billedAnnually : ' ',
      features: copy.features.pro,
      possibilityText: copy.possibilities.pro,
      ctaText: copy.select,
      badge: copy.popular,
      cardClass: `${styles.card} ${styles.pro}`,
      nameClass: `${styles.planName} ${styles.planNamePro}`,
      ctaClass: `${styles.ctaButton} ${styles.ctaPrimary}`,
      action: () => router.push(`/${lang}/dashboard`),
    },
    {
      id: 'enterprise',
      name: copy.enterprise,
      price: billing === 'monthly' ? prices[currency].proMonthly : prices[currency].proAnnual,
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
            <span className={styles.priceCurrency}>{prices[currency].symbol}</span>
            <span className={styles.priceValue}>{plan.price}</span>
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
              
              <button className={activePlanData.ctaClass} onClick={activePlanData.action}>
                <span>{activePlanData.ctaText}</span>
                <ArrowRight size={14} className={styles.arrowIcon} />
              </button>
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
                <button className={plan.ctaClass} onClick={plan.action}>
                  <span>{plan.ctaText}</span>
                  <ArrowRight size={14} className={styles.arrowIcon} />
                </button>
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
