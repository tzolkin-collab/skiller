'use client';

/**
 * Onde o Stripe devolve quem acabou de pagar.
 *
 * É a única página do app que recebe alguém SEM sessão e com direito a entrar:
 * a compra é a credencial. O backend confere com o Stripe que o pagamento saiu,
 * encontra a conta que o webhook criou a partir do e-mail, e devolve o cookie.
 *
 * Redireciona para o painel imediatamente após criar a sessão.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle } from 'lucide-react';
import { LogoText } from '@/components/ui/Logo/LogoText';
import { entrarPeloCheckout, ErroAuth } from '@/lib/auth-client';
import { confirmarCheckout } from '@/lib/billing';
import styles from '../entrar/entrar.module.css';

export default function BemVindoClient({ lang }: { lang: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState('Falando com o Stripe…');

  const jaTrocou = useRef(false);

  useEffect(() => {
    if (jaTrocou.current) return;
    jaTrocou.current = true;

    if (!sessionId) {
      setErro('Link incompleto — falta a referência da compra.');
      return;
    }

    const executar = async (tentativa = 0) => {
      try {
        const r = await entrarPeloCheckout(sessionId);
        
        // Dispara a checagem no background só para garantir os logs/metadados no servidor
        void confirmarCheckout(sessionId).catch(() => {});
        
        // Redireciona para o painel. Se precisar de senha, vai para configurações.
        // Usa window.location.href em vez de router.replace para forçar um hard reload,
        // garantindo que o middleware do Next.js enxergue o novo cookie de sessão.
        if (r.needsPassword) {
          window.location.href = `/${lang}/dashboard/settings?setup_password=true`;
        } else {
          window.location.href = `/${lang}/dashboard`;
        }
      } catch (e) {
        const erroAuth = e instanceof ErroAuth ? e : null;

        if (erroAuth?.status === 202 && tentativa < 6) {
          setMensagem('Preparando sua conta…');
          setTimeout(() => { void executar(tentativa + 1); }, 1500);
          return;
        }

        setErro(erroAuth?.message ?? 'Não foi possível concluir.');
      }
    };

    void executar();
  }, [sessionId, lang, router]);

  return (
    <div className={styles.tela}>
      <div className={styles.cartao}>
        <Link href={`/${lang}`} className={styles.marca}><LogoText height={28} /></Link>

        {!erro ? (
          <>
            <h1 className={styles.titulo}>Confirmando sua compra…</h1>
            <p className={styles.mensagem}>
              <Loader2 size={15} className={styles.girando} /> {mensagem}
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.titulo}>Não conseguimos concluir</h1>
            <p className={`${styles.mensagem} ${styles.mensagemErro}`}>
              <AlertCircle size={15} /> {erro}
            </p>
            <p className={styles.dica} style={{ marginTop: '0.9rem', fontSize: '0.8rem' }}>
              Se o pagamento saiu, sua conta existe. Entre pelo e-mail que você usou na compra —
              nós enviamos um link de acesso.
            </p>
            <div className={styles.alternativas}>
              <Link href={`/${lang}/entrar`}>Entrar pelo e-mail</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

