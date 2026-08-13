'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Globe, ChevronDown, Check } from 'lucide-react';
import styles from './LanguageSwitcher.module.css';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

export function LanguageSwitcher({ 
  align = 'right',
  variant = 'default' 
}: { 
  align?: 'left' | 'right';
  variant?: 'default' | 'icon';
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // pathname is something like /en/dashboard or /pt
  const segments = pathname.split('/');
  const currentLang = segments[1] || 'en';

  const handleSelect = (code: string) => {
    if (!pathname) {
      router.push(`/${code}`);
      return;
    }
    const newSegments = [...segments];
    newSegments[1] = code;
    router.push(newSegments.join('/'));
    setIsOpen(false);
  };

  // Click-outside is now handled by a full-screen invisible backdrop

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button 
        className={`${variant === 'icon' ? styles.triggerIcon : styles.trigger} ${isOpen ? styles.active : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <Globe size={variant === 'icon' ? 24 : 16} className={variant === 'icon' ? '' : styles.icon} />
        {variant === 'default' && (
          <>
            <span className={styles.label}>{currentLang.toUpperCase()}</span>
            <ChevronDown size={14} className={`${styles.chevron} ${isOpen ? styles.rotated : ''}`} />
          </>
        )}
      </button>

      {isOpen && (
        <>
          {/* Invisible backdrop to catch clicks outside the dropdown */}
          <div 
            className={styles.backdrop} 
            onClick={() => setIsOpen(false)}
            aria-hidden="true" 
          />
          <div 
            className={styles.dropdown} 
            style={{ [align]: 0 }}
          >
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className={`${styles.option} ${currentLang === lang.code ? styles.selected : ''}`}
                onClick={() => handleSelect(lang.code)}
              >
                <span className={styles.flag}>{lang.flag}</span>
                <span className={styles.langName}>{lang.label}</span>
                <span className={styles.langCode}>{lang.code.toUpperCase()}</span>
                {currentLang === lang.code && <Check size={14} className={styles.check} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
