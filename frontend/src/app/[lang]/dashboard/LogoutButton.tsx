'use client';

/**
 * O botão de sair.
 *
 * Antes era um `<button>` sem `onClick` no layout — ícone decorativo. Clicar
 * não fazia nada, e como o layout é server component ele não podia ter handler.
 *
 * Depois de sair, navega com `location.assign` em vez de `router.push`: o push
 * mantém a árvore RSC já renderizada em cache, então o painel continuaria na
 * tela mesmo sem sessão. Sair é o caso em que recarregar tudo é o certo.
 */
import { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { sair } from '@/lib/auth-client';
import styles from './LogoutButton.module.css';

export function LogoutButton({ lang, title, className }: { lang: string; title: string; className?: string }) {
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        title={erro ?? title}
        aria-label={title}
        disabled={saindo}
        onClick={async () => {
          setSaindo(true);
          setErro(null);
          try {
            await sair();
            // Só navega depois que o servidor confirmou. Navegar antes disso
            // trocava a tela mantendo a sessão viva — parecia que o botão não
            // fazia nada, quando na verdade a falha estava sendo engolida.
            window.location.assign(`/${lang}`);
          } catch {
            setSaindo(false);
            setErro(
              lang === 'pt'
                ? 'Não foi possível sair. Verifique a conexão com o servidor.'
                : 'Could not sign out. Check the connection to the server.'
            );
          }
        }}
      >
        {saindo ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
      </button>
      {erro && <span role="alert" className={styles.erro}>{erro}</span>}
    </>
  );
}
