'use client';

/**
 * O pop-up de sessão.
 *
 * O middleware e o layout barram quem chega sem estar logado. Falta o outro
 * caso: a sessão que expira — ou é revogada em outro dispositivo — com a pessoa
 * já dentro do painel. Sem isto a tela continua de pé enquanto toda chamada
 * volta 401, e o resultado parece bug em vez de logout.
 *
 * Bloqueia a interação e oferece a volta para o login guardando onde a pessoa
 * estava, para ela voltar exatamente ao mesmo lugar.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LogIn, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-client';
import styles from './SessionGate.module.css';

export function SessionGate({ lang }: { lang: string }) {
  const { usuario, carregado } = useAuth();
  const pathname = usePathname();
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    // Só depois de `carregado`: antes disso `usuario` é null porque a
    // verificação não terminou, e o modal piscaria em toda navegação.
    setVisivel(carregado && !usuario);
  }, [carregado, usuario]);

  if (!visivel) return null;

  const destino = `/${lang}/entrar?next=${encodeURIComponent(pathname)}`;

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-labelledby="sg-titulo">
      <div className={styles.card}>
        <ShieldAlert size={22} className={styles.icone} aria-hidden="true" />
        <h2 id="sg-titulo" className={styles.titulo}>
          {lang === 'pt' ? 'Sua sessão expirou' : 'Your session expired'}
        </h2>
        <p className={styles.texto}>
          {lang === 'pt'
            ? 'Entre de novo para continuar de onde parou.'
            : 'Sign in again to pick up where you left off.'}
        </p>
        <a className={styles.botao} href={destino}>
          <LogIn size={16} aria-hidden="true" />
          {lang === 'pt' ? 'Entrar' : 'Sign in'}
        </a>
      </div>
    </div>
  );
}
