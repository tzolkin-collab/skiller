'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Dictionary } from '@/types/dictionary';
import styles from './Breadcrumbs.module.css';

interface BreadcrumbsProps {
  lang: string;
  dict: Dictionary;
}

// Maps route segments to i18n keys
function getSegmentLabel(segment: string, dict: Dictionary): string {
  const map: Record<string, string> = {
    dashboard: dict.nav.dashboard,
    library: dict.dashboard.mySkills,
    connectors: dict.dashboard.connector,
    settings: dict.settings.title,
    watch: 'Watch',
  };
  return map[segment] || segment;
}

export function Breadcrumbs({ lang, dict }: BreadcrumbsProps) {
  const pathname = usePathname();

  // Remove lang prefix and split: /pt/dashboard/library → ['dashboard', 'library']
  const withoutLang = pathname.replace(`/${lang}`, '') || '/';
  const segments = withoutLang.split('/').filter(Boolean);

  // Skip the 'skills' segment's UUID child (e.g. /dashboard/skills/abc-123)
  // and query-based pages like /dashboard/watch?v=xxx
  const crumbs = segments.map((segment, i) => {
    const href = `/${lang}/${segments.slice(0, i + 1).join('/')}`;
    const label = getSegmentLabel(segment, dict);
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  // If we're at the dashboard root with no sub-segments, show just "Dashboard"
  if (crumbs.length <= 1) {
    return (
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <span className={styles.current}>{dict.nav.dashboard}</span>
      </nav>
    );
  }

  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className={styles.crumbItem}>
          {i > 0 && <span className={styles.separator}>/</span>}
          {crumb.isLast ? (
            <span className={styles.current}>{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className={styles.link}>
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
