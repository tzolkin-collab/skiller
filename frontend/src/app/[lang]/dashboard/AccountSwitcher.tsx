'use client';

/**
 * Quem está logado, no rodapé da barra lateral.
 *
 * Ocupa o bloco que trazia "Pro User / user@example.com" escrito no HTML, e
 * depois disso um seletor de contas de desenvolvimento. Agora mostra a pessoa
 * de verdade — a que o cookie de sessão identifica — e oferece sair.
 *
 * Sem sessão, vira um convite para entrar: o painel não deve fingir que tem
 * dono quando não tem.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn, LogOut, MailWarning } from 'lucide-react';
import { useAuth, sair, reenviarConfirmacao } from '@/lib/auth-client';
import styles from './layout.module.css';

export function AccountSwitcher({ lang }: { lang: string }) {
  const { usuario, carregado } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    window.addEventListener('click', fechar);
    return () => window.removeEventListener('click', fechar);
  }, [aberto]);

  if (!carregado) {
    return (
      <div className={styles.userProfile}>
        <div className={styles.avatar} />
        <div className={styles.userInfo}>
          <p className={styles.userName}>…</p>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <Link href={`/${lang}/entrar`} className={styles.userProfile} style={{ textDecoration: 'none' }}>
        <div className={styles.avatar}><LogIn size={15} /></div>
        <div className={styles.userInfo}>
          <p className={styles.userName}>Entrar</p>
          <p className={styles.userEmail}>Sem conta conectada</p>
        </div>
      </Link>
    );
  }

  const inicial = (usuario.name ?? usuario.email).charAt(0).toUpperCase();

  return (
    <div className={styles.userProfile} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setAberto((v) => !v); }}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%',
          background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
          color: 'inherit', textAlign: 'left', minWidth: 0,
        }}
      >
        <div className={styles.avatar}>{inicial}</div>
        <div className={styles.userInfo} style={{ minWidth: 0 }}>
          <p className={styles.userName}>{usuario.name ?? usuario.email.split('@')[0]}</p>
          <p className={styles.userEmail}>{usuario.email}</p>
        </div>
        {/* Um e-mail não confirmado impede recibo e aviso de cobrança de
            chegarem — merece ficar visível, não escondido em Configurações. */}
        {!usuario.emailVerified && (
          <MailWarning size={14} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
        )}
      </button>

      {aberto && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 40,
            padding: '4px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {!usuario.emailVerified && (
            <button
              type="button"
              onClick={async () => { await reenviarConfirmacao(); setReenviado(true); }}
              disabled={reenviado}
              style={itemMenu}
            >
              <MailWarning size={13} style={{ flexShrink: 0 }} />
              {reenviado ? 'E-mail reenviado' : 'Confirmar e-mail'}
            </button>
          )}

          <Link href={`/${lang}/dashboard/settings`} style={{ ...itemMenu, textDecoration: 'none' }}>
            Minha conta
          </Link>

          <button
            type="button"
            onClick={async () => {
              // Mesma razao do LogoutButton: `recarregar()` sozinho deixava o
              // painel na tela sem sessao. Recarrega a pagina inteira.
              try { await sair(); } finally { window.location.assign(`/${lang}`); }
            }}
            style={itemMenu}
          >
            <LogOut size={13} style={{ flexShrink: 0 }} />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

const itemMenu: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
  background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
  padding: '0.5rem 0.6rem', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)', fontSize: '0.8rem',
};
