'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import { useAuth } from '@/lib/auth-client';
import { AccountTab } from './AccountTab';
import { User, CreditCard, Sliders, MonitorSmartphone, Check, Sparkles, CheckCircle2, Loader2, AlertCircle, Wifi, WifiOff, Clock, Trash2 } from 'lucide-react';
import styles from './Settings.module.css';
import {
  buscarCatalogo, criarCheckout, abrirPortal, formatarValor, confirmarCheckout,
  rotuloCapacidade,
  type Catalogo, type ConfirmacaoCheckout, type BillingPeriod,
} from '@/lib/billing';

import type { Dictionary } from '@/types/dictionary';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface Conta {
  plan: {
    id: string;
    label: string;
    priceCents: number | null;
    monthlyCredits: number;
    /** `true` enquanto o teste corre. A franquia é outra, e menor. */
    trialing?: boolean;
    /** Contra o que ler o saldo. Cai para `monthlyCredits` em contas antigas. */
    allowance?: number;
  };
  credits: number;
  capabilities: string[];
}

interface McpDevice {
  id: string;
  userCode: string;
  status: 'pending' | 'authorized' | 'expired';
  tokenPreview: string | null;
  isExpired: boolean;
  createdAt: string;
  expiresAt: string;
}

interface SettingsContentProps {
  dict: Dictionary;
}

/**
 * O que ocupa a tela enquanto a sessão resolve.
 *
 * Tem a forma do conteúdo que vem — título, bloco, duas linhas — para nada
 * saltar quando os dados chegam. Antes deste componente, esse instante
 * mostrava "Nenhuma conta conectada", e quem estava logado via a própria tela
 * dizer que não estava.
 */
function Esqueleto() {
  return (
    <div className={styles.esqueleto} aria-hidden="true">
      <div className={`${styles.esqLinha} ${styles.esqTitulo}`} />
      <div className={`${styles.esqLinha} ${styles.esqBloco}`} />
      <div className={styles.esqLinha} />
      <div className={`${styles.esqLinha} ${styles.esqMedia}`} />
      <div className={`${styles.esqLinha} ${styles.esqCurta}`} />
    </div>
  );
}

export function SettingsContent({ dict }: SettingsContentProps) {
  const [activeTab, setActiveTab] = useState<'account' | 'plan' | 'preferences' | 'connections'>('account');

  const params = useParams();
  // `searchParams` segue em uso para o retorno do checkout (`session_id`).
  const searchParams = useSearchParams();
  const lang = typeof params?.lang === 'string' ? params.lang : 'pt';
  // A conta vem da sessao — antes esta tela mandava editar `?userId=` na URL.
  const { userId, pronto: sessaoPronta } = useSession();
  const { usuario, carregado } = useAuth();

  const [conta, setConta] = useState<Conta | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [periodo, setPeriodo] = useState<BillingPeriod>('monthly');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ── Dispositivos MCP ───────────────────────────────────────────────────────
  const [devices, setDevices] = useState<McpDevice[] | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const fetchDevices = () => {
    if (!userId) return;
    fetch(`${BASE_URL}/api/account/devices`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: McpDevice[]) => setDevices(d))
      .catch(() => setDevicesError('Erro ao carregar dispositivos.'));
  };

  useEffect(() => {
    if (activeTab === 'connections') fetchDevices();
  }, [activeTab, userId]);

  const revokeDevice = async (id: string) => {
    if (!userId) return;
    setRevokingId(id);
    setRevokeError(null);
    try {
      const r = await fetch(
        `${BASE_URL}/api/account/devices/${id}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!r.ok) throw new Error();
      setDevices((prev) =>
        prev
          ? prev.map((d) => (d.id === id ? { ...d, status: 'expired' as const, isExpired: true } : d))
          : prev
      );
    } catch {
      setRevokeError(dict.settings.connections.revokeError);
    } finally {
      setRevokingId(null);
    }
  };

  // ── Confirmação de checkout ────────────────────────────────────────────────
  const sessionId = searchParams.get('session_id');
  const voltouDoCheckout = searchParams.get('checkout') === 'sucesso' && Boolean(sessionId);
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoCheckout | null>(null);
  const [falhaConfirmacao, setFalhaConfirmacao] = useState<string | null>(null);

  useEffect(() => {
    if (!voltouDoCheckout || !sessionId) return;
    let vivo = true;
    let tentativas = 0;

    const checar = async () => {
      try {
        const r = await confirmarCheckout(sessionId, userId);
        if (!vivo) return;
        setConfirmacao(r);

        if (r.paid && !r.activated && tentativas < 8) {
          tentativas += 1;
          setTimeout(checar, 1500);
          return;
        }
        if (r.activated) {
          fetch(BASE_URL + '/api/account', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : null))
            .then((d) => { if (vivo && d) setConta(d); })
            .catch(() => {});
        }
      } catch (e) {
        if (vivo) setFalhaConfirmacao(e instanceof Error ? e.message : 'Falha ao confirmar.');
      }
    };

    checar();
    return () => { vivo = false; };
  }, [voltouDoCheckout, sessionId, userId]);

  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    fetch(BASE_URL + '/api/account', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d) setConta(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [userId]);

  useEffect(() => {
    let vivo = true;
    buscarCatalogo().then((c) => { if (vivo) setCatalogo(c); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const planoAtual = conta?.plan.id ?? null;

  /** Maior desconto anual da tabela — o que o seletor de período anuncia. */
  const economiaAnual = Math.max(
    0,
    ...(catalogo?.plans ?? []).map((p) => p.savingsPercent ?? 0)
  );

  /**
   * O que este plano acrescenta em relação ao imediatamente inferior.
   *
   * Repetir a lista inteira em cada cartão esconde a diferença, que é
   * justamente a informação de compra.
   */
  const capacidadesNovas = (planId: string): Set<string> => {
    const lista = catalogo?.plans ?? [];
    const i = lista.findIndex((p) => p.id === planId);
    if (i <= 0) return new Set(lista[0]?.capabilities ?? []);
    const anterior = new Set(lista[i - 1].capabilities);
    return new Set(lista[i].capabilities.filter((c) => !anterior.has(c)));
  };
  const doCatalogo = catalogo?.plans.find((p) => p.id === planoAtual);
  const proNoCatalogo = catalogo?.plans.find((p) => p.id === 'pro');
  const jaNoTopo = planoAtual === 'pro' || planoAtual === 'enterprise';

  /**
   * O que mostrar como preço do plano em vigor.
   *
   * `free` não é um tier com preço zero — é a ausência de assinatura. Dizer
   * "Gratuito" aqui reintroduzia, dentro do app, a mesma ideia de plano grátis
   * que a página de preços deixou de vender.
   */
  const precoAtual = (): string => {
    if (!conta) return '—';
    if (conta.plan.id === 'free') return lang === 'pt' ? 'sem assinatura' : 'no subscription';
    if (doCatalogo?.monthly == null) return lang === 'pt' ? 'Sob consulta' : 'Custom';
    return (catalogo?.symbol ?? '') + ' ' + formatarValor(doCatalogo.monthly, lang);
  };

  /**
   * Assinar um plano.
   *
   * Quem já tem assinatura NÃO passa por aqui: trocar de plano é alterar a que
   * existe, pelo portal, com o valor ajustado proporcionalmente. Abrir um
   * checkout novo criaria uma segunda assinatura e uma segunda cobrança — o
   * backend recusa com 409, e esta função nem chega a tentar.
   */
  /** Já ocupa o lugar: qualquer troca passa pelo portal. */
  const temAssinatura = Boolean(conta && conta.plan.id !== 'free');

  const assinar = async (plan: 'starter' | 'pro') => {
    if (!userId || !catalogo) return;
    if (temAssinatura) return gerenciar();
    setErro(null);
    setOcupado(true);
    try {
      window.location.href = await criarCheckout({
        userId, plan, period: periodo, currency: catalogo.currency, lang,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir o checkout.');
      setOcupado(false);
    }
  };

  const gerenciar = async () => {
    if (!userId) return;
    setErro(null);
    setOcupado(true);
    try {
      window.location.href = await abrirPortal(lang);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir o portal.');
      setOcupado(false);
    }
  };

  const renderConfirmacao = () => {
    if (!voltouDoCheckout) return null;

    if (falhaConfirmacao) {
      return (
        <div className={`${styles.confirmacao} ${styles.confirmacaoFalhou}`}>
          <AlertCircle size={20} className={styles.confirmacaoIcone} />
          <div className={styles.confirmacaoCorpo}>
            <p className={styles.confirmacaoTitulo}>
              {lang === 'pt' ? 'Não conseguimos confirmar este pagamento' : 'We could not confirm this payment'}
            </p>
            <div className={styles.confirmacaoLinhas}><span>{falhaConfirmacao}</span></div>
          </div>
        </div>
      );
    }

    if (!confirmacao) {
      return (
        <div className={`${styles.confirmacao} ${styles.confirmacaoPendente}`}>
          <Loader2 size={20} className={styles.confirmacaoIcone} />
          <div className={styles.confirmacaoCorpo}>
            <p className={styles.confirmacaoTitulo}>
              {lang === 'pt' ? 'Verificando o pagamento…' : 'Checking the payment…'}
            </p>
          </div>
        </div>
      );
    }

    if (!confirmacao.paid) {
      return (
        <div className={`${styles.confirmacao} ${styles.confirmacaoFalhou}`}>
          <AlertCircle size={20} className={styles.confirmacaoIcone} />
          <div className={styles.confirmacaoCorpo}>
            <p className={styles.confirmacaoTitulo}>
              {lang === 'pt' ? 'Pagamento ainda não confirmado' : 'Payment not confirmed yet'}
            </p>
            <div className={styles.confirmacaoLinhas}>
              <span>
                {lang === 'pt'
                  ? `O Stripe informa o estado "${confirmacao.paymentStatus ?? confirmacao.status}". Seu plano não mudou.`
                  : `Stripe reports "${confirmacao.paymentStatus ?? confirmacao.status}". Your plan has not changed.`}
              </span>
            </div>
          </div>
        </div>
      );
    }

    const valor = confirmacao.amountTotal != null
      ? `${confirmacao.currency ?? ''} ${formatarValor(confirmacao.amountTotal, lang)}`
      : null;
    const periodo = confirmacao.interval === 'year'
      ? (lang === 'pt' ? 'por ano' : 'per year')
      : (lang === 'pt' ? 'por mês' : 'per month');
    const renova = confirmacao.renewsAt
      ? new Date(confirmacao.renewsAt).toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang)
      : null;

    if (!confirmacao.activated) {
      return (
        <div className={`${styles.confirmacao} ${styles.confirmacaoPendente}`}>
          <Loader2 size={20} className={styles.confirmacaoIcone} />
          <div className={styles.confirmacaoCorpo}>
            <p className={styles.confirmacaoTitulo}>
              {lang === 'pt'
                ? `Pagamento aprovado. Liberando o ${confirmacao.planLabel}…`
                : `Payment approved. Activating ${confirmacao.planLabel}…`}
            </p>
            <div className={styles.confirmacaoLinhas}>
              {valor ? <span>{valor} {periodo}</span> : null}
              <span>{lang === 'pt' ? 'Leva alguns segundos.' : 'This takes a few seconds.'}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.confirmacao}>
        <CheckCircle2 size={20} className={styles.confirmacaoIcone} />
        <div className={styles.confirmacaoCorpo}>
          <p className={styles.confirmacaoTitulo}>
            {lang === 'pt'
              ? `Pagamento confirmado. ${confirmacao.planLabel} está ativo.`
              : `Payment confirmed. ${confirmacao.planLabel} is active.`}
          </p>
          <div className={styles.confirmacaoLinhas}>
            {valor ? <span><strong>{valor}</strong> {periodo}</span> : null}
            <span>{confirmacao.monthlyCredits} {lang === 'pt' ? 'créditos por mês' : 'credits per month'}</span>
            {renova ? <span>{lang === 'pt' ? 'Renova em' : 'Renews on'} <strong>{renova}</strong></span> : null}
            {confirmacao.email ? <span>{lang === 'pt' ? 'Recibo para' : 'Receipt to'} <strong>{confirmacao.email}</strong></span> : null}
          </div>
          <div className={styles.confirmacaoAcoes}>
            <button className={styles.confirmacaoLink} onClick={() => setActiveTab('plan')}>
              {dict.settings.tabs.plan}
            </button>
            <button className={styles.confirmacaoLink} onClick={() => setActiveTab('connections')}>
              {dict.settings.tabs.connections}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Status helpers ─────────────────────────────────────────────────────────
  const statusLabel = (d: McpDevice): string => {
    if (d.isExpired || d.status === 'expired') return dict.settings.connections.statusExpired;
    if (d.status === 'authorized') return dict.settings.connections.statusAuthorized;
    return dict.settings.connections.statusPending;
  };

  const statusClass = (d: McpDevice): string => {
    if (d.isExpired || d.status === 'expired') return styles.deviceExpired;
    if (d.status === 'authorized') return styles.deviceActive;
    return styles.devicePending;
  };

  const isRevocable = (d: McpDevice) =>
    d.status === 'authorized' && !d.isExpired;

  return (
    <>
    {renderConfirmacao()}
    <div className={styles.container}>
      {/* SIDEBAR */}
      <div className={styles.sidebar}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'account' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('account')}
        >
          <User size={18} />
          {dict.settings.tabs.account}
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'plan' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('plan')}
        >
          <CreditCard size={18} />
          {dict.settings.tabs.plan}
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'preferences' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          <Sliders size={18} />
          {dict.settings.tabs.preferences}
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'connections' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('connections')}
        >
          <MonitorSmartphone size={18} />
          {dict.settings.tabs.connections}
        </button>
      </div>

      {/* CONTENT */}
      <div className={styles.content}>

        {/* ACCOUNT TAB */}
        {activeTab === 'account' && (
          !carregado
            ? <div className={styles.tabContent}><Esqueleto /></div>
            : usuario
            ? <AccountTab lang={lang} usuario={usuario} dict={dict} />
            : (
              <div className={styles.tabContent}>
                <div className={styles.semConta}>
                  <User size={30} />
                  <strong>{lang === 'pt' ? 'Nenhuma conta conectada' : 'No account connected'}</strong>
                  <span>
                    {lang === 'pt'
                      ? 'Entre na sua conta para ver e editar seu perfil.'
                      : 'Sign in to view and edit your profile.'}
                  </span>
                </div>
              </div>
            )
        )}

        {/* PLAN TAB */}
        {activeTab === 'plan' && (
          <div className={styles.tabContent}>
            {/* Esqueleto enquanto a sessao E a conta resolvem. Antes eram dois
                estados vazios em sequencia: area em branco, depois 'Carregando…'
                dentro do card, depois o valor. Tres saltos para uma informacao. */}
            {!sessaoPronta || (userId && !conta) ? (
              <Esqueleto />
            ) : !userId ? (
              <div className={styles.semConta}>
                <CreditCard size={30} />
                <strong>{lang === 'pt' ? 'Nenhuma conta conectada' : 'No account connected'}</strong>
                <span>
                  {lang === 'pt'
                    ? 'Entre na sua conta para ver o plano e assinar.'
                    : 'Sign in to see your plan and subscribe.'}
                </span>
              </div>
            ) : (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{dict.settings.plan.currentPlan}</h3>
                  <p className={styles.cardDesc}>{lang === 'pt' ? 'Gerencie sua assinatura e veja os planos disponíveis' : 'Manage your subscription and view available plans'}</p>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.currentPlanCard}>
                    <div className={styles.planHeader}>
                      <div className={styles.planBadge}>{conta?.plan.label ?? '…'}</div>
                      {/* Quem está no teste precisa ver isso aqui, e não só no
                          e-mail: é a informação que decide se vale cancelar
                          antes da cobrança. */}
                      {conta?.plan.trialing ? (
                        <span className={styles.seloTeste}>
                          {lang === 'pt' ? 'em teste' : 'in trial'}
                        </span>
                      ) : null}
                      <div className={styles.planPrice}>
                        {precoAtual()}
                        {doCatalogo?.monthly != null && !conta?.plan.trialing
                          ? <span>/{lang === 'pt' ? 'mês' : 'mo'}</span>
                          : null}
                      </div>
                    </div>
                    <p className={styles.planDesc}>
                      {conta
                        ? `${conta.credits} ${lang === 'pt' ? 'de' : 'of'} ${conta.plan.allowance ?? conta.plan.monthlyCredits} ${
                            conta.plan.trialing
                              ? (lang === 'pt' ? 'créditos no teste' : 'credits in the trial')
                              : (lang === 'pt' ? 'créditos neste ciclo' : 'credits this cycle')
                          }`
                        : (lang === 'pt' ? 'Carregando…' : 'Loading…')}
                    </p>
                  </div>

                  {/* O período vale para a grade inteira; não é atributo de plano. */}
                  <div className={styles.periodoToggle}>
                    <button
                      className={`${styles.periodoBtn} ${periodo === 'monthly' ? styles.periodoAtivo : ''}`}
                      onClick={() => setPeriodo('monthly')}
                    >
                      {lang === 'pt' ? 'Mensal' : 'Monthly'}
                    </button>
                    <button
                      className={`${styles.periodoBtn} ${periodo === 'annual' ? styles.periodoAtivo : ''}`}
                      onClick={() => setPeriodo('annual')}
                    >
                      {lang === 'pt' ? 'Anual' : 'Annual'}
                      {economiaAnual > 0 && <span className={styles.economia}>−{economiaAnual}%</span>}
                    </button>
                  </div>

                  {/*
                    `free` fora da grade: não é uma opção que alguém escolhe, é
                    o estado de quem não escolheu nenhuma. Renderizá-lo como
                    card, ao lado dos pagos, oferecia "ficar sem plano" como
                    alternativa — e sem botão, porque não há o que assinar.
                  */}
                  <div className={styles.grade}>
                    {(catalogo?.plans ?? []).filter((p) => p.id !== 'free').map((p) => {
                      const atual = p.id === planoAtual;
                      const novas = capacidadesNovas(p.id);
                      const cents = periodo === 'annual' ? p.annualPerMonth ?? p.monthly : p.monthly;

                      return (
                        <div key={p.id} className={`${styles.planoCard} ${atual ? styles.planoAtual : ''}`}>
                          <div className={styles.planoNome}>
                            {p.label}
                            {atual && (
                              <span className={styles.planoAtualTag}>
                                {lang === 'pt' ? 'atual' : 'current'}
                              </span>
                            )}
                          </div>

                          <div className={styles.planoValor}>
                            {cents == null
                              ? (lang === 'pt' ? 'Sob consulta' : 'Custom')
                              : (
                                <>
                                  {catalogo?.symbol} {formatarValor(cents, lang)}
                                  <small>/{lang === 'pt' ? 'mês' : 'mo'}</small>
                                </>
                              )}
                          </div>

                          <div className={styles.planoCreditos}>
                            {p.monthlyCredits} {lang === 'pt' ? 'créditos/mês' : 'credits/mo'}
                            {p.members > 1 && ` · ${p.members} ${lang === 'pt' ? 'membros' : 'members'}`}
                          </div>

                          <ul className={styles.planoCaps}>
                            {p.capabilities.map((cap) => (
                              <li key={cap} className={novas.has(cap) ? styles.capNova : ''}>
                                <Check size={13} className={styles.checkIcon} />
                                {rotuloCapacidade(cap, lang)}
                              </li>
                            ))}
                          </ul>

                          {atual ? (
                            conta?.plan.priceCents ? (
                              <button className={styles.planoBtn} onClick={gerenciar} disabled={ocupado}>
                                {ocupado ? (lang === 'pt' ? 'Abrindo…' : 'Opening…')
                                         : (lang === 'pt' ? 'Gerenciar assinatura' : 'Manage subscription')}
                              </button>
                            ) : null
                          ) : p.purchasable ? (
                            <button
                              className={`${styles.planoBtn} ${styles.planoBtnPrimario}`}
                              onClick={() => assinar(p.id as 'starter' | 'pro')}
                              disabled={ocupado}
                            >
                              {ocupado
                                ? (lang === 'pt' ? 'Abrindo…' : 'Opening…')
                                : temAssinatura
                                  ? (lang === 'pt' ? `Trocar para ${p.label}` : `Switch to ${p.label}`)
                                  : (lang === 'pt' ? `Assinar ${p.label}` : `Subscribe to ${p.label}`)}
                            </button>
                          ) : p.id === 'enterprise' ? (
                            <a href={`/${lang}/contact`} className={styles.planoBtn} style={{ textAlign: 'center', textDecoration: 'none' }}>
                              {dict.pricing?.contactSales ?? (lang === 'pt' ? 'Falar com vendas' : 'Contact sales')}
                            </a>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {!catalogo && (
                    <p className={styles.planDesc}>
                      {lang === 'pt'
                        ? 'Cobrança indisponível neste ambiente — falta STRIPE_SECRET_KEY.'
                        : 'Billing unavailable in this environment — STRIPE_SECRET_KEY is missing.'}
                    </p>
                  )}

                  {erro ? <p className={styles.planDesc}>{erro}</p> : null}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PREFERENCES TAB */}
        {activeTab === 'preferences' && (
          <div className={styles.tabContent}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{dict.settings.preferences.theme}</h3>
                <p className={styles.cardDesc}>{lang === 'pt' ? 'Personalize a aparência do sistema' : 'Customize the system appearance'}</p>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.themeOptions}>
                  <button className={`${styles.themeBtn} ${styles.themeActive}`}>Dark (Default)</button>
                  <button className={styles.themeBtn} disabled>Light (Soon)</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONNECTIONS TAB — dispositivos MCP */}
        {activeTab === 'connections' && (
          <div className={styles.tabContent}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <MonitorSmartphone size={20} className={styles.upsellIcon} />
                  <div>
                    <h3 className={styles.cardTitle}>{dict.settings.connections.devicesTitle}</h3>
                    <p className={styles.cardDesc}>{dict.settings.connections.devicesSubtitle}</p>
                  </div>
                </div>
              </div>
              
              <div className={styles.cardBody} style={{ padding: 0 }}>
                {devicesError && (
                  <p className={styles.devicesErrMsg} style={{ padding: '1.5rem' }}>{devicesError}</p>
                )}

                {!devices && !devicesError && (
                  <div className={styles.devicesLoading} style={{ padding: '1.5rem' }}>
                    <Loader2 size={16} className={styles.spin} />
                    <span>{lang === 'pt' ? 'Carregando…' : 'Loading…'}</span>
                  </div>
                )}

                {revokeError && (
                  <p className={styles.devicesErrMsg} style={{ padding: '0 1.5rem' }}>{revokeError}</p>
                )}

                {devices && devices.length === 0 && (
                  <div className={styles.devicesEmpty} style={{ border: 'none', margin: '1.5rem' }}>
                    <WifiOff size={32} />
                    <p>{dict.settings.connections.noDevices}</p>
                    <span>{dict.settings.connections.noDevicesHint}</span>
                  </div>
                )}

                {devices && devices.length > 0 && (
                  <ul className={styles.devicesList} style={{ gap: 0 }}>
                    {devices.map((device, index) => (
                      <li key={device.id} className={`${styles.deviceItem} ${statusClass(device)}`} style={{ border: 'none', borderRadius: 0, borderBottom: index < devices.length - 1 ? '1px solid var(--border-light)' : 'none', padding: '1.5rem' }}>
                        <div className={styles.deviceIcon}>
                          {isRevocable(device) ? <Wifi size={18} /> : <WifiOff size={18} />}
                        </div>

                        <div className={styles.deviceInfo}>
                          <div className={styles.deviceRow}>
                            <span className={styles.deviceCode}>{device.userCode}</span>
                            <span className={`${styles.deviceStatus} ${statusClass(device)}`}>
                              {statusLabel(device)}
                            </span>
                          </div>

                          {device.tokenPreview && (
                            <div className={styles.deviceMeta}>
                              <span>{dict.settings.connections.tokenPreview}:</span>
                              <code className={styles.tokenPreview}>{device.tokenPreview}</code>
                            </div>
                          )}

                          <div className={styles.deviceDates}>
                            <span>
                              <Clock size={11} />
                              {dict.settings.connections.connectedOn}: {new Date(device.createdAt).toLocaleDateString()}
                            </span>
                            <span>
                              {dict.settings.connections.expiresOn}: {new Date(device.expiresAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {isRevocable(device) && (
                          <button
                            className={styles.revokeBtn}
                            onClick={() => revokeDevice(device.id)}
                            disabled={revokingId === device.id}
                            title={dict.settings.connections.revokeBtn}
                          >
                            {revokingId === device.id ? (
                              <Loader2 size={14} className={styles.spin} />
                            ) : (
                              <Trash2 size={14} />
                            )}
                            {revokingId === device.id
                              ? dict.settings.connections.revoking
                              : dict.settings.connections.revokeBtn}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
