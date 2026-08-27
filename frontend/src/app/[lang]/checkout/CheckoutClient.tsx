'use client';

/**
 * Checkout dentro do app, em dois painéis.
 *
 * O formulário é montado com Stripe Elements sobre uma Checkout Session em
 * `ui_mode: 'elements'`. A escolha importa: continua sendo uma Checkout
 * Session, então cupom, imposto, moeda e idioma seguem sendo trabalho do
 * Stripe — o que ganhamos é desenhar a página em volta e estilizar os campos
 * pela Appearance API.
 *
 * Só existem dois elementos aqui, e é de propósito: `PaymentElement` e
 * `BillingAddressElement` são os únicos que a integração de Elements com
 * Checkout Sessions documenta e entrega em runtime. `TaxIdElement`,
 * `ContactDetailsElement` e `TermsElement` são declarados nos tipos mas o
 * Stripe.js publicado não os expõe (`createTaxIdElement is not a function`) —
 * estão no preview. Por isso o e-mail é um campo nosso, e os termos são texto
 * nosso. As AÇÕES (`confirm`, `updateEmail`) são diferentes: vêm de
 * `loadActions()` em runtime, não de declarações de tipo, e por isso dá para
 * contar com elas.
 *
 * O retorno é `/bem-vindo?session_id=...`, o mesmo do modo hospedado, e é o
 * webhook que ativa o plano. Esta página não concede nada.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  CheckoutElementsProvider,
  PaymentElement,
  BillingAddressElement,
  CurrencySelectorElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';

import { criarCheckoutElements, type SessaoElements, type Currency } from '@/lib/billing';
import { APARENCIA_SKILLER, FONTES_SKILLER } from '@/lib/stripe-appearance';
import { useSession } from '@/lib/session';
import { LogoText } from '@/components/ui/Logo/LogoText';
import styles from './page.module.css';

type Plano = 'starter' | 'pro';


function textos(lang: string) {
  const pt = lang === 'pt';
  return {
    voltar: pt ? 'Voltar aos planos' : 'Back to plans',
    titulo: pt ? 'Finalizar assinatura' : 'Complete your subscription',
    carregando: pt ? 'Preparando o checkout…' : 'Preparing checkout…',
    pagamento: pt ? 'Pagamento' : 'Payment',
    cobranca: pt ? 'Endereço de cobrança' : 'Billing address',
    confirmar: pt ? 'Confirmar assinatura' : 'Confirm subscription',
    confirmando: pt ? 'Confirmando…' : 'Confirming…',
    hoje: pt ? 'Você paga hoje' : 'Due today',
    seguro: pt
      ? 'Pagamento processado pela Stripe. Não guardamos dados do seu cartão.'
      : 'Payment processed by Stripe. We never store your card details.',
    semTeste: pt ? 'Cobrança imediata' : 'Charged immediately',
  };
}

const INTERVALO: Record<string, { pt: string; en: string }> = {
  day: { pt: 'dia', en: 'day' },
  week: { pt: 'semana', en: 'week' },
  month: { pt: 'mês', en: 'month' },
  year: { pt: 'ano', en: 'year' },
};

/** Coluna da esquerda: o que está sendo assinado e quanto custa. */
function Resumo({
  lang,
  sessao,
  onVoltar,
}: {
  lang: string;
  sessao: SessaoElements;
  onVoltar: () => void;
}) {
  const t = textos(lang);
  const pt = lang === 'pt';
  const estado = useCheckoutElements();
  const pronto = estado.type === 'success';

  // Todos os valores vêm do Stripe já formatados na moeda certa, e não de uma
  // conta nossa: é ele que conhece cupom, imposto e o zero do teste.
  const total = pronto ? estado.checkout.total.total.amount : null;
  const recorrente = pronto ? estado.checkout.recurring : null;
  const itens = pronto ? estado.checkout.lineItems : [];

  const intervalo = recorrente ? INTERVALO[recorrente.interval] : null;
  const depois =
    recorrente && intervalo
      ? `${recorrente.dueNext.total.amount} / ${pt ? intervalo.pt : intervalo.en}`
      : null;

  return (
    <div className={styles.interno}>
      <button className={styles.voltar} onClick={onVoltar}>
        <ArrowLeft size={14} />
        <span>{t.voltar}</span>
      </button>

      <LogoText height={24} />

      <p className={styles.rotuloValor}>{t.hoje}</p>
      {total ? <p className={styles.valor}>{total}</p> : <span className={styles.esqueleto} aria-hidden />}

      {depois ? (
        <p className={styles.depois}>
          {pt ? 'Depois, ' : 'Then '}
          {depois}
        </p>
      ) : null}

      {sessao.trialDays ? (
        <div className={styles.selo}>
          {pt ? `${sessao.trialDays} dias grátis` : `${sessao.trialDays} days free`}
        </div>
      ) : (
        <div className={styles.seloNeutro}>{t.semTeste}</div>
      )}

      {itens.length > 0 ? (
        <div className={styles.itens}>
          {itens.map((item) => (
            <div key={item.id} className={styles.item}>
              <span className={styles.itemNome}>{item.name}</span>
              <span className={styles.itemValor}>{item.total.amount}</span>
            </div>
          ))}
        </div>
      ) : null}

      {sessao.trialDays && sessao.trialCredits ? (
        <p className={styles.nota}>
          {pt
            ? `Você recebe ${sessao.trialCredits} créditos para usar durante o teste. Cancelando dentro de ${sessao.trialDays} dias, nada é cobrado.`
            : `You get ${sessao.trialCredits} credits during the trial. Cancel within ${sessao.trialDays} days and you pay nothing.`}
        </p>
      ) : null}

      <div className={styles.rodape}>
        <ShieldCheck size={14} />
        <span>{t.seguro}</span>
      </div>
    </div>
  );
}

/** Coluna da direita: campos e botão. */
function Formulario({ lang }: { lang: string }) {
  const t = textos(lang);
  const pt = lang === 'pt';
  const estado = useCheckoutElements();

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Populado só quando o Adaptive Pricing tem moeda local a oferecer.
  const moedas = estado.type === 'success' ? estado.checkout.currencyOptions : null;


  if (estado.type === 'loading') {
    return (
      <div className={styles.interno}>
        <h1 className={styles.tituloForm}>{t.titulo}</h1>
        <p className={styles.carregando}>{t.carregando}</p>
      </div>
    );
  }
  if (estado.type === 'error') {
    return (
      <div className={styles.interno}>
        <h1 className={styles.tituloForm}>{t.titulo}</h1>
        <p className={styles.erro}>{estado.error.message}</p>
      </div>
    );
  }

  const { checkout } = estado;


  const confirmar = async () => {
    setErro(null);
    setEnviando(true);
    // Manda o e-mail junto: se a pessoa clicar em Confirmar sem tirar o foco do
    // campo, o blur não rodou e a sessão ainda não teria o valor.
    const r = await checkout.confirm();
    // Só chega aqui quando NÃO houve redirecionamento. Em 3DS ou Pix o
    // navegador já saiu para o banco e volta pela `return_url`.
    if (r.type === 'error') setErro(r.error.message ?? null);
    setEnviando(false);
  };

  return (
    <div className={styles.interno}>
      <h1 className={styles.tituloForm}>{t.titulo}</h1>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
      >
        <section className={styles.secao}>
          <h2 className={styles.secaoTitulo}>{t.pagamento}</h2>

          {/* Seletor de moeda do Adaptive Pricing.
              Fica ACIMA do Payment Element por recomendação da Stripe: a moeda
              escolhida muda quais formas de pagamento aparecem abaixo.
              Renderizar o seletor é OBRIGATÓRIO ao usar Adaptive Pricing.
              O guarda em `currencyOptions` não é zelo: `createCurrencySelectorElement`
              vive numa camada do SDK que só existe quando o Adaptive Pricing
              está ativo. Com ele desligado no Dashboard, montar o componente
              quebraria com `is not a function` — o mesmo erro do TaxIdElement. */}
          {moedas && moedas.length > 0 ? (
            <div className={styles.moeda}>
              <CurrencySelectorElement />
            </div>
          ) : null}

          <PaymentElement
            options={{
              // Abas em vez de acordeão: com poucos métodos, o acordeão gasta
              // altura escondendo o que caberia lado a lado.
              layout: { type: 'tabs' },
              // Os termos são texto nosso, logo abaixo do botão. Sem isto o
              // Stripe imprime os dele e a página mostra dois avisos.
              terms: { card: 'never' },
            }}
          />
        </section>

        <section className={styles.secao}>
          <h2 className={styles.secaoTitulo}>{t.cobranca}</h2>
          <BillingAddressElement options={{ display: { name: 'full' } }} />
        </section>

        {erro ? <p className={styles.erro}>{erro}</p> : null}

        <button type="submit" className={styles.botao} disabled={!checkout.canConfirm || enviando}>
          <Lock size={14} />
          <span>{enviando ? t.confirmando : t.confirmar}</span>
        </button>

        {/* Texto nosso: o `TermsElement` do Stripe está no preview. */}
        <p className={styles.termos}>
          {pt ? 'Ao confirmar, você concorda com os ' : 'By confirming, you agree to the '}
          <a href={`/${lang}/legal/termos`}>{pt ? 'Termos de Uso' : 'Terms of Service'}</a>
          {pt ? ' e a ' : ' and '}
          <a href={`/${lang}/legal/privacidade`}>
            {pt ? 'Política de Privacidade' : 'Privacy Policy'}
          </a>
          {pt
            ? '. A assinatura renova automaticamente e pode ser cancelada quando quiser.'
            : '. The subscription renews automatically and can be cancelled at any time.'}
        </p>
      </form>
    </div>
  );
}

export default function CheckoutClient({ lang }: { lang: string }) {
  const t = textos(lang);
  const router = useRouter();
  const params = useSearchParams();
  const { userId, pronto } = useSession();

  const [sessao, setSessao] = useState<SessaoElements | null>(null);
  const [stripe, setStripe] = useState<Promise<Stripe | null> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const plan = (params.get('plan') === 'pro' ? 'pro' : 'starter') as Plano;
  const period = params.get('period') === 'annual' ? 'annual' : 'monthly';
  const currency = (params.get('currency') ?? 'BRL').toUpperCase() as Currency;

  const voltar = () => router.push(`/${lang}/pricing`);

  // Comprar exige conta. O e-mail e os dados de contato já foram dados no
  // cadastro, então pedir de novo aqui seria repetir trabalho — e era o que a
  // versão anterior fazia, quando a conta nascia DEPOIS do pagamento.
  useEffect(() => {
    if (!pronto || userId) return;
    const volta = `/${lang}/checkout?${params.toString()}`;
    router.replace(`/${lang}/entrar?next=${encodeURIComponent(volta)}`);
  }, [pronto, userId, lang, params, router]);

  // A sessão nasce assim que a conta está resolvida. O e-mail vai junto, vindo
  // do cadastro — o `ContactDetailsElement` que o coletaria está no preview do
  // Stripe, e agora não precisamos dele.
  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    criarCheckoutElements({ userId, plan, period, currency, lang })
      .then((s) => {
        if (!vivo) return;
        setSessao(s);
        // A chave pública vem do backend, e não de um NEXT_PUBLIC: assim ela
        // acompanha o ambiente do STRIPE_SECRET_KEY em vez de depender de
        // alguém lembrar de trocar as duas.
        setStripe(loadStripe(s.publishableKey));
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível abrir o checkout.');
      });
    return () => {
      vivo = false;
    };
  }, [userId, plan, period, currency, lang]);

  const opcoes = useMemo(
    () =>
      sessao
        ? {
            clientSecret: sessao.clientSecret,
            elementsOptions: { appearance: APARENCIA_SKILLER, fonts: FONTES_SKILLER },
            // Declara a integração pronta para o Adaptive Pricing. Sem isto o
            // Stripe não converte, mesmo com `adaptive_pricing.enabled` na
            // sessão: ele exige que a página saiba exibir a moeda local e
            // renderizar o seletor antes de mexer nos valores.
            adaptivePricing: { allowed: true },
          }
        : null,
    [sessao]
  );

  // As duas colunas existem desde o primeiro quadro, mesmo sem sessão: montá-las
  // só depois faria a página saltar de um bloco de texto para o layout inteiro.
  if (!sessao || !stripe || !opcoes) {
    return (
      <div className={styles.pagina}>
        <div className={styles.colResumo}>
          <div className={styles.interno}>
            <button className={styles.voltar} onClick={voltar}>
              <ArrowLeft size={14} />
              <span>{t.voltar}</span>
            </button>
            <LogoText height={24} />
            <p className={styles.rotuloValor}>{t.hoje}</p>
            <span className={styles.esqueleto} aria-hidden />
          </div>
        </div>
        <div className={styles.colForm}>
          <div className={styles.interno}>
            <h1 className={styles.tituloForm}>{t.titulo}</h1>
            {erro ? (
              <p className={styles.erro}>{erro}</p>
            ) : (
              <p className={styles.carregando}>{t.carregando}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pagina}>
      <CheckoutElementsProvider stripe={stripe} options={opcoes}>
        <div className={styles.colResumo}>
          <Resumo lang={lang} sessao={sessao} onVoltar={voltar} />
        </div>
        <div className={styles.colForm}>
          <Formulario lang={lang} />
        </div>
      </CheckoutElementsProvider>
    </div>
  );
}
