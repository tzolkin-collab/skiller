'use client';

/**
 * A gaveta do menu no celular.
 *
 * O estado mora num atributo do `<html>`, não em React: quem abre é o botão
 * no topbar e quem reage é a `<aside>`, e os dois estão em ramos distintos da
 * árvore. Subir esse estado até o layout obrigaria a transformar o Server
 * Component inteiro em cliente — um custo alto para um booleano.
 *
 * Fecha ao navegar. Sem isso a gaveta continuaria aberta sobre a página nova,
 * porque em navegação client-side o layout não remonta.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import styles from './layout.module.css';

function marcar(aberto: boolean) {
  const html = document.documentElement;
  if (aberto) html.dataset.nav = 'aberto';
  else delete html.dataset.nav;
}

export function MenuBotao({ rotulo }: { rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();

  const fechar = useCallback(() => setAberto(false), []);

  useEffect(() => { marcar(aberto); }, [aberto]);

  // Navegou: fecha. Também limpa o atributo ao desmontar, para a marca não
  // sobreviver a uma saída do painel.
  useEffect(() => { setAberto(false); }, [caminho]);
  useEffect(() => () => marcar(false), []);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto, fechar]);

  return (
    <>
      <button
        type="button"
        className={styles.menuBtn}
        aria-label={rotulo}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        {aberto ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Fora do fluxo (position: fixed), então a posição no DOM não importa;
          fica aqui para nascer e morrer junto com o botão. */}
      <button
        type="button"
        className={styles.backdrop}
        aria-label={rotulo}
        tabIndex={aberto ? 0 : -1}
        onClick={fechar}
      />
    </>
  );
}
