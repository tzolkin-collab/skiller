/**
 * Radiant Obsidian traduzido para a Appearance API do Stripe.
 *
 * Por que um arquivo separado e não CSS: o formulário do Stripe roda dentro de
 * um iframe em `js.stripe.com`, e o navegador não deixa nosso CSS atravessar
 * essa fronteira — nem folhas de estilo, nem variáveis CSS, nem estilos de
 * framework. A única forma de estilizar aquele conteúdo é este objeto, enviado
 * por JS na inicialização.
 *
 * Pela mesma razão a fonte não pode vir de `var(--font-roboto)`: aquela
 * variável é do nosso documento e não existe lá dentro. O iframe precisa
 * baixar a própria cópia, e é para isso que serve `FONTES_SKILLER` abaixo.
 *
 * Os valores espelham `app/globals.css` e o `--bg-form` de
 * `app/[lang]/checkout/page.module.css`. Se mexer na paleta, mexa aqui.
 */
import type { Appearance, CssFontSource } from '@stripe/stripe-js';

/** Espelho de `globals.css`. Um lugar só para o que este arquivo consome. */
const OBSIDIAN = {
  /** Fundo dos campos — recuado em relação ao painel, para dar profundidade. */
  campo: '#0A0A0A',
  /** Fundo do painel do formulário. Igual ao `--bg-form` do CSS module. */
  painel: '#101010',
  elevado: '#1A1A1A',
  borda: '#262626',
  linha: '#1f1f1f',
  textPrimary: '#e5e2e1',
  textSecondary: '#c8c6c5',
  textMuted: '#929090',
  accent: '#ff3333',
  radius: '4px',
} as const;

/**
 * O iframe baixa a própria Roboto.
 *
 * O app serve a fonte por `next/font` (auto-hospedada), inalcançável de dentro
 * do iframe. Sem isto o Stripe cai na fonte de sistema e o formulário fica com
 * tipografia diferente do resto da página — o detalhe que mais denuncia um
 * checkout embutido.
 */
export const FONTES_SKILLER: CssFontSource[] = [
  {
    cssSrc: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600&display=swap',
  },
];

export const APARENCIA_SKILLER: Appearance = {
  // `night` já parte de um fundo escuro. Começar do `stripe` (claro) obrigaria
  // a sobrescrever dezenas de variáveis para chegar no mesmo lugar.
  theme: 'night',

  // Campos espaçados com rótulo acima: é o padrão dos nossos formulários, e
  // rótulo flutuante dentro do campo brigaria com o raio de 4px.
  labels: 'above',
  inputs: 'spaced',

  variables: {
    fontFamily: 'Roboto, Arial, Helvetica, sans-serif',
    fontSizeBase: '15px',
    // Um pouco mais de ar que o padrão: o formulário ocupa uma coluna inteira
    // e campos apertados fazem a metade direita parecer densa ao lado do
    // resumo, que é esparso por natureza.
    spacingUnit: '5px',
    borderRadius: OBSIDIAN.radius,

    colorPrimary: OBSIDIAN.accent,
    colorBackground: OBSIDIAN.painel,
    colorText: OBSIDIAN.textPrimary,
    colorTextSecondary: OBSIDIAN.textSecondary,
    colorTextPlaceholder: OBSIDIAN.textMuted,
    colorDanger: OBSIDIAN.accent,

    // O vermelho da marca é o mesmo do estado de erro. Sem forçar o texto do
    // botão para o claro, o Stripe calcularia um contraste próprio e o CTA
    // sairia com uma cor que não é a nossa.
    buttonColorText: OBSIDIAN.textPrimary,

    iconColor: OBSIDIAN.textMuted,
    iconHoverColor: OBSIDIAN.textPrimary,
    tabIconColor: OBSIDIAN.textMuted,
    tabIconSelectedColor: OBSIDIAN.accent,
  },

  rules: {
    // ---- campos ----
    '.Input': {
      backgroundColor: OBSIDIAN.campo,
      border: `1px solid ${OBSIDIAN.borda}`,
      boxShadow: 'none',
      padding: '12px 14px',
      // Menor que 16px, o Safari no iOS dá zoom ao focar.
      fontSize: '16px',
    },
    '.Input:hover': {
      border: `1px solid #333333`,
    },
    '.Input:focus': {
      border: `1px solid ${OBSIDIAN.accent}`,
      boxShadow: `0 0 0 1px ${OBSIDIAN.accent}`,
      outline: 'none',
    },
    '.Input--invalid': {
      border: `1px solid ${OBSIDIAN.accent}`,
      boxShadow: 'none',
      color: OBSIDIAN.textPrimary,
    },

    // ---- rótulos ----
    '.Label': {
      color: OBSIDIAN.textSecondary,
      fontSize: '13px',
      fontWeight: '500',
      marginBottom: '6px',
    },

    // ---- seletor de forma de pagamento ----
    '.Tab': {
      backgroundColor: OBSIDIAN.campo,
      border: `1px solid ${OBSIDIAN.borda}`,
      boxShadow: 'none',
      color: OBSIDIAN.textSecondary,
      padding: '12px',
      transition: 'border-color 0.15s ease, background-color 0.15s ease',
    },
    '.Tab:hover': {
      backgroundColor: OBSIDIAN.elevado,
      color: OBSIDIAN.textPrimary,
    },
    '.Tab--selected': {
      backgroundColor: OBSIDIAN.elevado,
      border: `1px solid ${OBSIDIAN.accent}`,
      color: OBSIDIAN.textPrimary,
      boxShadow: 'none',
    },
    '.Tab--selected:focus': {
      boxShadow: `0 0 0 1px ${OBSIDIAN.accent}`,
      border: `1px solid ${OBSIDIAN.accent}`,
    },
    '.TabLabel': {
      fontWeight: '500',
    },

    // ---- blocos e erros ----
    '.Block': {
      backgroundColor: OBSIDIAN.campo,
      border: `1px solid ${OBSIDIAN.borda}`,
      boxShadow: 'none',
    },
    '.Error': {
      color: OBSIDIAN.accent,
      fontSize: '13px',
      marginTop: '6px',
    },
    '.CheckboxInput': {
      backgroundColor: OBSIDIAN.campo,
      borderColor: OBSIDIAN.borda,
    },
    '.CheckboxInput--checked': {
      backgroundColor: OBSIDIAN.accent,
      borderColor: OBSIDIAN.accent,
    },
  },
};
