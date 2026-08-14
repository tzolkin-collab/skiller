import Link from 'next/link';
import { LogOut, Settings, LayoutDashboard, Plug, Wand2, Library } from 'lucide-react';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher/LanguageSwitcher';
import { Logo } from '@/components/ui/Logo/Logo';
import { LogoText } from '@/components/ui/Logo/LogoText';
import { getDictionary } from '@/dictionaries';
import styles from './layout.module.css';

export default async function DashboardLayout({ children, params }: { children: React.ReactNode, params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <div className={styles.layout}>
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
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userProfile}>
            <div className={styles.avatar}>U</div>
            <div className={styles.userInfo}>
              <p className={styles.userName}>Pro User</p>
              <p className={styles.userEmail}>user@example.com</p>
            </div>
          </div>
          <button className={styles.logoutBtn} title={dict.dashboard.logout}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.breadcrumbs}>
            <Link href={`/${lang}/dashboard`} style={{ textDecoration: 'none', color: 'inherit' }}>
              {dict.nav.dashboard}
            </Link>
            <span className={styles.separator}>/</span>
            <Link href={`/${lang}/dashboard/library`} className={styles.current} style={{ textDecoration: 'none', color: 'inherit' }}>
              {dict.dashboard.mySkills}
            </Link>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <LanguageSwitcher />
            <Link href={`/${lang}/dashboard/settings`} className={styles.settingsBtn}>
              <Settings size={20} />
            </Link>
          </div>
        </div>
        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}
