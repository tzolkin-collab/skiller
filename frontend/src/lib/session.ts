'use client';

/**
 * Quem está usando o painel.
 *
 * Passou a ser um repasse da autenticação de verdade (`auth-client`). Antes
 * guardava um `userId` escolhido à mão no `localStorage`, aceito por qualquer
 * rota do backend — o que significava que trocar uma string no console dava
 * acesso à conta de qualquer pessoa. Isso acabou: quem responde é o cookie de
 * sessão, que o JavaScript não lê e outro site não consegue enviar.
 *
 * O módulo continua existindo porque meia dúzia de telas já o consomem; manter
 * a mesma forma migrou todas de uma vez, sem tocar em cada uma.
 */
import { useCallback } from 'react';
import { useAuth, sair as sairDaConta } from './auth-client';

export interface Sessao {
  /** `null` quando não há ninguém logado. */
  userId: string | null;
  /** `false` até a primeira resposta do backend — evita piscar "sem conta". */
  pronto: boolean;
  sair: () => Promise<void>;
}

export function useSession(): Sessao {
  const { usuario, carregado, recarregar } = useAuth();

  const sair = useCallback(async () => {
    await sairDaConta();
    await recarregar();
  }, [recarregar]);

  return { userId: usuario?.id ?? null, pronto: carregado, sair };
}
