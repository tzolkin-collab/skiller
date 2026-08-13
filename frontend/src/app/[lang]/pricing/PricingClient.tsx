'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

import DepthCarousel from '@/components/ui/DepthCarousel/DepthCarousel';
import type { Dictionary } from '@/types/dictionary';

type Currency = 'USD' | 'BRL' | 'EUR';
type BillingPeriod = 'monthly' | 'annual';

type PricingDict = Dictionary & { pricing?: Record<string, string> };

interface PricingClientProps {
  lang: string;
  dict: PricingDict;
}

export default function PricingClient({ lang, dict }: PricingClientProps) {
  const router = useRouter();
  const [currency, setCurrency] = useState<Currency>('USD');
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [activeIndex, setActiveIndex] = useState(1); // Default to PRO

  // Depth Carousel fires onChange aggressively, so we need to set initial state right away,
  // but let's default to 1 since we want to show PRO by default in the design.
  
  const copy = {
    eyebrow: dict.pricing?.eyebrow || 'Pricing',
    title: dict.pricing?.title || 'Choose Your',
    titleAccent: 'Weapon',
    subtitle: dict.pricing?.subtitle || 'Start free, upgrade when you need unlimited power. No surprises, cancel anytime.',
    free: dict.pricing?.free || 'Starter',
    pro: dict.pricing?.pro || 'Skiller Pro',
    enterprise: dict.pricing?.enterprise || 'Enterprise',
    select: dict.pricing?.select || 'Get Started',
    popular: dict.pricing?.popular || 'Most Popular',
    monthly: dict.pricing?.monthly || 'Monthly',
    annual: dict.pricing?.annual || 'Annual',
    save: dict.pricing?.save || '-20%',
    perMonth: dict.pricing?.perMonth || '/mo',
    billedAnnually: dict.pricing?.billedAnnually || 'billed annually',
    foreverFree: dict.pricing?.foreverFree || 'free forever',
    customPricing: dict.pricing?.customPricing || 'Custom',
    contactSales: dict.pricing?.contactSales || 'Contact Sales',
    footerNote: dict.pricing?.footerNote || 'Need a custom plan for your team?',
    contactUs: dict.pricing?.contactUs || 'Contact us',
    features: {
      free: [
        '10 Videos per month',
        'Standard Generation Speed',
        'Markdown Export',
        'Community Support',
      ],
      pro: [
        'Unlimited Videos',
        'Maximum Generation Speed',
        'Priority Support',
        'Custom Branding',
        'API Access',
        'Advanced Analytics',
      ],
      enterprise: [
        'Dedicated Infrastructure',
        'SLA 99.99%',
        'SSO & SAML Authentication',
        'Custom Integrations',
        'Dedicated Account Manager',
        'On-premise Deployment Options',
      ],
    },
  };

  const prices: Record<Currency, { free: number; proMonthly: number; proAnnual: number; symbol: string }> = {
    USD: { free: 0, proMonthly: 19, proAnnual: 15, symbol: '$' },
    BRL: { free: 0, proMonthly: 97, proAnnual: 77, symbol: 'R$' },
    EUR: { free: 0, proMonthly: 19, proAnnual: 15, symbol: '€' },
  };

  const carouselItems = [
    { image: '/assets/pricing/plan_starter.jpg', alt: 'Starter Plan' },
    { image: '/assets/pricing/plan_pro.jpg', alt: 'Skiller Pro Plan' },
    { image: '/assets/pricing/plan_enterprise.jpg', alt: 'Enterprise Plan' },
  ];

  const plansData = [
    {
      id: 'free',
      name: copy.free,
      price: 0,
      period: copy.perMonth,
      subtext: copy.foreverFree,
      features: copy.features.free,
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
      subtext: billing === 'annual' ? copy.billedAnnually : '\u00A0',
      features: copy.features.pro,
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
      price: null, // Custom
      period: '',
      subtext: 'Para equipes B2B de alto volume',
      features: copy.features.enterprise,
      ctaText: copy.contactSales,
      badge: null,
      cardClass: `${styles.card} ${styles.enterprise}`,
      nameClass: `${styles.planName} ${styles.planNameEnterprise}`,
      ctaClass: `${styles.ctaButton} ${styles.ctaSecondary} ${styles.enterpriseBtn}`,
      action: () => router.push(`/${lang}/contact`),
    },
  ];

  const activePlanData = plansData[activeIndex] || plansData[1];

  // Helper to render a card content given the plan data
  const renderCardContent = (plan: typeof plansData[0], isCarouselContext = false) => (
    <div className={`${plan.cardClass} ${isCarouselContext ? styles.carouselCardContent : ''}`}>
      {plan.badge && <span className={styles.popularBadge}>{plan.badge}</span>}
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

      <button className={plan.ctaClass} onClick={plan.action}>
        {plan.ctaText}
        <ArrowRight size={14} className={styles.arrowIcon} />
      </button>
    </div>
  );

  // Auto focus the carousel to index 1 (Pro) after mount since loop is false 
  // wait, DepthCarousel doesn't expose a method to set index programmatically from outside unless we use ref.
  // By default DepthCarousel starts at 0, so if we want the state to match, we could either start state at 0,
  // or modify the component to take initialIndex. We will let it start at 0, so change initial state to 0.
  useEffect(() => {
    setActiveIndex(0);
  }, []);

  return (
    <div className={styles.pageContainer}>
      <div className={styles.container}>


        {/* Desktop Split Layout (Hidden on Mobile) */}
        <div className={styles.desktopSplitLayout}>
          <div className={styles.leftColumn}>
            {/* The active plan's detailed view */}
            {renderCardContent(activePlanData, true)}
          </div>
          <div className={styles.rightColumn}>
            <div className={styles.carouselWrapper}>
              <DepthCarousel
                items={carouselItems}
                autoplay={false}
                loop={false}
                visibleCards={3}
                cardWidth={280}
                cardHeight={350}
                onChange={(idx) => setActiveIndex(idx)}
              />
              <div className={styles.carouselInstruction}>
                ← Arraste para selecionar o plano →
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Stacked Layout (Hidden on Desktop) */}
        <div className={styles.mobileStackedLayout}>
          {plansData.map((plan) => (
            <div key={plan.id} className={styles.mobileCardWrapper}>
              {renderCardContent(plan)}
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className={styles.footerNote}>
          <p className={styles.footerText}>
            {copy.footerNote}{' '}
            <a href={`/${lang}/contact`} className={styles.footerLink}>
              {copy.contactUs} →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
