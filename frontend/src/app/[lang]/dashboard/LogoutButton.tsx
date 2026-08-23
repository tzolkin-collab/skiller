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

export function LogoutButton({ lang, title, className }: { lang: string; title: string; className?: string }) {
  const [saindo, setSaindo] = useState(false);

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={title}
      disabled={saindo}
      onClick={async () => {
        setSaindo(true);
        try {
          await sair();
        } catch {
          // Sessão já inválida no servidor dá no mesmo: o destino é sair.
        } finally {
          window.location.assign(`/${lang}`);
        }
      }}
    >
      {saindo ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
    </button>
  );
}
