import { motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { Logo } from '../Logo/Logo';
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher';
import styles from '../LandingPageClient/LandingPageClient.module.css';
import type { Dictionary } from '@/types/dictionary';

interface SidebarProps {
  setIsMenuOpen: (open: boolean) => void;
  dict: Dictionary;
}

export function Sidebar({ setIsMenuOpen, dict }: SidebarProps) {
  return (
    <motion.aside 
      className={styles.sidebar}
      initial={{ x: -80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 1.4, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className={styles.sidebarTop}>
        <button className={styles.menuBtn} onClick={() => setIsMenuOpen(true)}>
          <Menu size={28} />
        </button>
      </div>
      <div className={styles.sidebarMiddle}>
        <span className={styles.sidebarText}>{dict.nav.vocationalIntelligence}</span>
      </div>
      <div className={styles.sidebarBottom}>
        <div className={styles.mobileLang}>
          <LanguageSwitcher align="right" variant="default" />
        </div>
        <Logo size={32} />
      </div>
    </motion.aside>
  );
}
