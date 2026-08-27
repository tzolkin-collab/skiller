'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { LogoText } from '../Logo/LogoText';
import styles from '../LandingPageClient/LandingPageClient.module.css';
import type { Dictionary } from '@/types/dictionary';

interface MenuOverlayProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  lang: string;
  dict: Dictionary;
}

export function MenuOverlay({ isOpen, setIsOpen, lang, dict }: MenuOverlayProps) {
  const links = [
    { label: dict.nav.features, href: null },
    { label: dict.nav.dashboard, href: `/${lang}/dashboard` },
    { label: dict.nav.pricing, href: `/${lang}/pricing` },
    { label: dict.nav.login, href: `/${lang}/entrar` },
    // Quem esta comecando cria conta; o link "Painel" acima continua indo
    // direto ao painel para quem ja usa.
    { label: dict.nav.getStarted, href: `/${lang}/dashboard` },
  ];

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setIsOpen]);

  return (
    <motion.div
      className={styles.menuOverlay}
      initial="closed"
      animate={isOpen ? 'open' : 'closed'}
      /* The panel stays mounted for the wipe animation, so without `inert` its
         links remain tabbable while the menu is visually closed. */
      inert={!isOpen}
      aria-hidden={!isOpen}
      variants={{
        open: { pointerEvents: 'auto' },
        closed: { pointerEvents: 'none' },
      }}
    >
      {/* Red Wipe */}
      <motion.div
        className={styles.menuWipeRed}
        variants={{
          open: { x: '0%', transition: { duration: 0.5, ease: [0.76, 0, 0.24, 1] } },
          closed: { x: '-100%', transition: { duration: 0.5, delay: 0.1, ease: [0.76, 0, 0.24, 1] } },
        }}
      />

      {/* Dark Menu Panel */}
      <motion.div
        className={styles.menuPanelDark}
        variants={{
          open: { x: '0%', transition: { duration: 0.5, delay: 0.1, ease: [0.76, 0, 0.24, 1] } },
          closed: { x: '-100%', transition: { duration: 0.5, delay: 0, ease: [0.76, 0, 0.24, 1] } },
        }}
      >
        <div className={styles.menuHeader}>
          <LogoText height={24} />
          <button className={styles.closeBtn} onClick={() => setIsOpen(false)} aria-label={dict.nav.close}>
            <X size={32} />
          </button>
        </div>
        <nav className={styles.navLinks}>
          {links.map((link, i) => (
            <motion.a
              key={link.label}
              href={link.href ?? '#'}
              className={styles.navLink}
              onClick={(event) => {
                // Nothing to navigate to yet, and on a no-scroll page a bare
                // "#" would only dirty the URL.
                if (!link.href) event.preventDefault();
                setIsOpen(false);
              }}
              variants={{
                open: { y: 0, opacity: 1, transition: { delay: 0.2 + i * 0.05 } },
                closed: { y: 20, opacity: 0, transition: { delay: 0 } },
              }}
            >
              {link.label}
            </motion.a>
          ))}
        </nav>
      </motion.div>
    </motion.div>
  );
}
