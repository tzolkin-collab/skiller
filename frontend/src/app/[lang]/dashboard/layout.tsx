import Link from 'next/link';
import { Settings, Plug, Wand2, Library, BrainCircuit } from 'lucide-react';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher/LanguageSwitcher';
import { Logo } from '@/components/ui/Logo/Logo';
import { LogoText } from '@/components/ui/Logo/LogoText';
import { getDictionary } from '@/dictionaries';
import { TopbarClient } from './TopbarClient';
import { AccountSwitcher } from './AccountSwitcher';
import { LogoutButton } from './LogoutButton';
import { GlobalScrollTracker } from './GlobalScrollTracker';
import { SessionGate } from '@/components/features/SessionGate/SessionGate';
import { PlanGate } from '@/components/features/PlanGate/PlanGate';
import { LiquidLoader } from '@/components/ui/Landing/LiquidLoader';
import { exigirSessao } from '@/lib/require-session';
import styles from './layout.module.css';

export default async function DashboardLayout({ children, params }: { children: React.ReactNode, params: Promise<{ lang: string }> }) {
  const { lang } = await params;

  // Portao do app. O middleware ja barra quem chega sem cookie; aqui a sessao e
  // conferida contra o backend, que e quem sabe se ela ainda vale.
  await exigirSessao(lang, `/${lang}/dashboard`);

  const dict = await getDictionary(lang);

  return (
    <div className={styles.layout}>
      {/* Global Overlays */}
      <LiquidLoader />

      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <Link href={`/${lang}`} className={styles.logo}>
            <Logo size={24} className={styles.logoIcon} />
            <LogoText height={18} />
          </Link>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            <p className={styles.navLabel}>{dict.dashboard.menu}</p>
            {/* Primeira parada de quem acabou de criar conta: e aqui que estao
                o plano, os creditos do ciclo e o pareamento da IDE. */}
            <Link href={`/${lang}/dashboard/settings`} className={styles.navLink}>
              <Settings size={18} />
              {dict.settings.title}
            </Link>
            <Link href={`/${lang}/dashboard`} className={styles.navLink}>
              <Wand2 size={18} />
              {dict.dashboard.generateTitle}
            </Link>
            <Link href={`/${lang}/dashboard/library`} className={styles.navLink}>
              <Library size={18} />
              {dict.dashboard.mySkills}
            </Link>
            <Link href={`/${lang}/dashboard/connectors`} className={styles.navLink}>
              <Plug size={18} />
              {dict.dashboard.connector}
            </Link>
            <Link href={`/${lang}/dashboard/base`} className={styles.navLink}>
              <BrainCircuit size={18} />
              Base da IA
            </Link>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          {/* Antes: "Pro User / user@example.com" escrito no HTML, igual para
              todo mundo. Agora mostra a conta de verdade e permite trocar —
              sem isso o painel exigia `?userId=` digitado na URL. */}
          <AccountSwitcher lang={lang} />
          <LogoutButton lang={lang} title={dict.dashboard.logout} className={styles.logoutBtn} />
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        <TopbarClient lang={lang} dict={dict} />
        <div id="main-scroll-container" className={styles.content}>
          <GlobalScrollTracker />
          {children}
          {/* Sessao que expira com a pessoa ja dentro do painel. */}
          <SessionGate lang={lang} />
          {/* Ordem importa: sessão morta vence assinatura ausente. Quem perdeu
              a sessão precisa entrar de novo antes de qualquer oferta fazer
              sentido — e o PlanGate se esconde sozinho quando não há usuário. */}
          <PlanGate lang={lang} />
        </div>
      </main>
    </div>
  );
}
