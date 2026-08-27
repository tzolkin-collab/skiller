'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs/Breadcrumbs';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher/LanguageSwitcher';
import { SearchAutocomplete } from '@/components/ui/SearchAutocomplete/SearchAutocomplete';
import { SourceSelector } from '@/components/ui/SourceSelector/SourceSelector';
import { FilterChips } from '@/components/ui/FilterChips/FilterChips';
import { FILTER_CHIPS } from './DashboardClient';
import { LogoutButton } from './LogoutButton';
import { useLayoutState } from '@/store/layoutState';
import type { Dictionary } from '@/types/dictionary';
import styles from './layout.module.css';

interface TopbarClientProps {
  lang: string;
  dict: Dictionary;
}

export function TopbarClient({ lang, dict }: TopbarClientProps) {
  const { isSearchInHeader, activeFilter, setActiveFilter, activeSourceTab, setActiveSourceTab } = useLayoutState();
  const showSearch = isSearchInHeader;

  return (
    <div className={styles.topbar}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
        {/* Sempre mostramos os comandos de voltar (Breadcrumbs) */}
        <Breadcrumbs lang={lang} dict={dict} />
      </div>
      
      <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
        <AnimatePresence mode="popLayout">
          {showSearch && (
            <motion.div
              layoutId="global-search"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}
            >
              <SourceSelector
                language={lang}
                activeTab={activeSourceTab}
                onTabChange={setActiveSourceTab}
                isCompact={true}
              >
                <div style={{ flex: 1 }}>
                  <SearchAutocomplete language={lang} />
                </div>
              </SourceSelector>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {isSearchInHeader && (
            <motion.div
              layoutId="global-filters"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '600px', margin: '0 auto', zoom: 0.8 }}
            >
              <FilterChips 
                chips={FILTER_CHIPS} 
                activeChip={activeFilter} 
                onSelectChip={setActiveFilter} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'flex-end' }}>
        <LanguageSwitcher />
        <Link href={`/${lang}/dashboard/settings`} className={styles.settingsBtn} title={dict.settings.title}>
          <Settings size={20} />
        </Link>
        <LogoutButton lang={lang} title={dict.dashboard.logout} className={styles.logoutBtn} />
      </div>
    </div>
  );
}
