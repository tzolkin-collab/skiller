'use client';

/**
 * O pop-up de plano.
 *
 * Quem entra sem assinatura em vigor chega até aqui — o painel carrega, e este
 * modal bloqueia por cima. É de propósito: a versão anterior redirecionava para
 * a tabela de preços, e o efeito era expulsar do app quem tinha acabado de
 * entrar nele. A pessoa clicava em "Começar" na landing, fazia login, e
 * aterrissava numa tabela que não pediu para ver, sem nunca ter visto o produto.
 *
 * Com o painel visível atrás do vidro, a oferta vem depois de a pessoa já estar
 * dentro. Login primeiro, app depois, plano por último.
 *
 * Irmão do `SessionGate`, e por isso a mesma forma. A diferença é o que cada um
 * resolve: aquele trata sessão que morreu, este trata assinatura que não existe.
 */
import { useEffect, useState } from 'react';
import { ArrowRight, LogOut, Sparkles } from 'lucide-react';
import { useSession } from '@/lib/session';
import { buscarConta } from '@/lib/account';
import styles from './PlanGate.module.css';

interface Props {
  lang: string;
  /** Dias e créditos do teste, para a oferta não repetir números à mão. */
  trialDays?: number | null;
  trialCredits?: number | null;
}

export function PlanGate({ lang, trialDays = 3, trialCredits = 300 }: Props) {
  const pt = lang === 'pt';
  const { userId, pronto, sair } = useSession();
  const [semPlano, setSemPlano] = useState(false);

  useEffect(() => {
    // Só depois de a sessão resolver. Antes disso não dá para distinguir
    // "sem plano" de "ainda não sei quem é", e o modal piscaria em toda
    // navegação — que foi o erro que o SessionGate já tinha aprendido.
    if (!pronto || !userId) {
      setSemPlano(false);
      return;
    }
    let vivo = true;
    buscarConta()
      .then((c) => {
        if (vivo) {
          const temPlano = Boolean(c.plan?.id && c.plan.id !== 'free');
          setSemPlano(!temPlano);
        }
      })
      .catch(() => {
        // Falha de rede não bloqueia o painel. Errar para o lado de deixar
        // passar é melhor que trancar quem já paga por causa de um timeout —
        // quem barra de verdade são os portões do backend, em cada chamada.
        if (vivo) setSemPlano(false);
      });
    return () => {
      vivo = false;
    };
  }, [pronto, userId]);

  if (!semPlano) return null;

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-labelledby="pg-titulo">
      <div className={styles.card}>
        <Sparkles size={22} className={styles.icone} aria-hidden="true" />

        <h2 id="pg-titulo" className={styles.titulo}>
          {pt ? 'Escolha um plano para começar' : 'Pick a plan to get started'}
        </h2>

        <p className={styles.texto}>
          {pt
            ? 'Sua conta está pronta. Falta só liberar o Skiller para transformar playlists e documentação em skills.'
            : 'Your account is ready. All that is left is unlocking Skiller to turn playlists and docs into skills.'}
        </p>

        {trialDays ? (
          <p className={styles.teste}>
            {pt
              ? `${trialDays} dias grátis${trialCredits ? ` · ${trialCredits} créditos` : ''} · cancele sem cobrança`
              : `${trialDays} days free${trialCredits ? ` · ${trialCredits} credits` : ''} · cancel at no charge`}
          </p>
        ) : null}

        <a className={styles.botao} href={`/${lang}/pricing`}>
          {pt ? 'Ver planos' : 'See plans'}
          <ArrowRight size={16} aria-hidden="true" />
        </a>

        <button
          type="button"
          className={styles.sair}
          onClick={async () => {
            try {
              await sair();
            } finally {
              window.location.assign(`/${lang}`);
            }
          }}
        >
          <LogOut size={14} aria-hidden="true" />
          {pt ? 'Sair da conta' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
