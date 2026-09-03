'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import {
  PlaySquare, Clock, Search, X, Layers, RadioTower,
  SlidersHorizontal, ChevronDown,
} from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import type { Dictionary } from '@/types/dictionary';
import type { SkillSummary, SkillNiche } from '@/types/api';
import { SKILL_NICHES, NICHE_LABEL } from '@/types/api';
import styles from '../page.module.css';
import { BASE_URL } from '@/lib/api-base';

interface LibraryClientProps {
  dict: Dictionary;
  lang: string;
}

// ─── Nicho: mapeamento de cor ────────────────────────────────────────────────
const NICHE_COLOR: Record<SkillNiche, string> = {
  marketing:   '#f97316',
  sales:       '#a855f7',
  traffic:     '#3b82f6',
  development: '#22c55e',
  productivity:'#eab308',
  design:      '#ec4899',
  finance:     '#14b8a6',
  other:       '#6b7280',
};

// ─── Skill Card ──────────────────────────────────────────────────────────────
function SkillCard({ skill, lang }: { skill: SkillSummary; lang: string }) {
  const router = useRouter();
  const niche = skill.niche as SkillNiche | null | undefined;
  const nicheColor = niche ? NICHE_COLOR[niche] : 'var(--accent-primary)';
  const nicheLabel = niche ? NICHE_LABEL[niche] : null;

  const initials = (skill.name ?? skill.channelName ?? '?')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase();

  return (
    <article
      className={styles.skillCard}
      style={{ '--niche-color': nicheColor } as React.CSSProperties}
      onClick={() => router.push(`/${lang}/dashboard/skills/${skill.id}`)}
    >
      <div className={styles.skillCardStripe} />
      <div className={styles.skillCardBody}>
        <div className={styles.skillCardHeader}>
          {skill.channelImageUrl ? (
            <Image src={skill.channelImageUrl} alt={skill.channelName || ''} width={40} height={40} className={styles.skillAvatarImage} unoptimized />
          ) : (
            <div className={styles.skillAvatar} style={{ background: nicheColor }}>
              {initials}
            </div>
          )}
          <div className={styles.skillCardMeta}>
            {nicheLabel && (
              <span className={styles.nicheBadge} style={{ color: nicheColor }}>
                {nicheLabel}
              </span>
            )}
            {skill.channelName && (
              <span className={styles.channelName}>
                <RadioTower size={11} />
                {skill.channelName}
              </span>
            )}
          </div>
          <span className={`${styles.statusBadge} ${styles[skill.status]}`}>
            {skill.status}
          </span>
        </div>

        <h3 className={styles.skillTitle}>
          {skill.name ?? <span className={styles.skillTitlePlaceholder}>Processing…</span>}
        </h3>

        {skill.description && (
          <p className={styles.skillDesc}>{skill.description}</p>
        )}

        <div className={styles.skillFooter}>
          <span className={styles.date}>
            <Clock size={12} />
            {new Date(skill.createdAt).toLocaleDateString()}
          </span>
          <PlaySquare size={14} className={styles.skillOpenIcon} />
        </div>
      </div>
    </article>
  );
}

// ─── Filter Modal ─────────────────────────────────────────────────────────────
interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  searchInput: string;
  onSearchChange: (v: string) => void;
  nicheFilter: SkillNiche | null;
  onNicheChange: (n: SkillNiche | null) => void;
  sourceFilter: string | null;
  onSourceChange: (s: string | null) => void;
  uniqueSources: string[];
  onClear: () => void;
  hasActiveFilters: boolean;
  searchPlaceholder: string;
  tx: {
    searchAndFilter: string;
    clear: string;
    clearAll: string;
    niche: string;
    all: string;
    source: string;
    allSources: string;
    applyFilters: string;
    filters: string;
    noSkillsFound: string;
    adjustFilters: string;
  };
}

function FilterModal({
  open, onClose,
  searchInput, onSearchChange,
  nicheFilter, onNicheChange,
  sourceFilter, onSourceChange,
  uniqueSources, onClear,
  hasActiveFilters, searchPlaceholder,
  tx
}: FilterModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Foca o input quando abre
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Fecha com Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  // Trava scroll do body
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`${styles.filterBackdrop} ${open ? styles.filterBackdropOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`${styles.filterPanel} ${open ? styles.filterPanelOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Filtrar skills"
      >
        {/* Handle decorativo */}
        <div className={styles.filterPanelHandle} />

        {/* Header do painel */}
        <div className={styles.filterPanelHeader}>
          <div className={styles.filterPanelTitle}>
            <SlidersHorizontal size={16} />
            <span>{tx.searchAndFilter}</span>
          </div>
          <div className={styles.filterPanelActions}>
            {hasActiveFilters && (
              <button className={styles.filterClearAll} onClick={onClear}>
                <X size={12} />
                {tx.clear}
              </button>
            )}
            <button className={styles.filterPanelClose} onClick={onClose} aria-label={tx.clear}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className={styles.filterSearchWrapper}>
          <Search size={16} className={styles.filterSearchIcon} />
          <input
            ref={inputRef}
            id="library-search"
            type="search"
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className={styles.filterSearchInput}
            autoComplete="off"
          />
          {searchInput && (
            <button
              className={styles.filterSearchClear}
              onClick={() => onSearchChange('')}
              aria-label="Limpar busca"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className={styles.filterDivider} />

        <div className={styles.filterLayoutRow}>
          {/* Nicho */}
          <div className={styles.filterGroup}>
            <div className={styles.filterGroupLabel}>
              <Layers size={13} />
              {tx.niche}
            </div>
            <div className={styles.filterChipGrid}>
              <button
                className={`${styles.filterChip} ${!nicheFilter ? styles.filterChipActive : ''}`}
                onClick={() => onNicheChange(null)}
              >
                {tx.all}
              </button>
            {SKILL_NICHES.map((n) => (
              <button
                key={n}
                className={`${styles.filterChip} ${nicheFilter === n ? styles.filterChipActive : ''}`}
                style={
                  nicheFilter === n
                    ? { '--fchip-color': NICHE_COLOR[n] } as React.CSSProperties
                    : {}
                }
                onClick={() => onNicheChange(nicheFilter === n ? null : n)}
              >
                <span
                  className={styles.filterChipDot}
                  style={{ background: NICHE_COLOR[n] }}
                />
                {NICHE_LABEL[n]}
              </button>
            ))}
          </div>
        </div>

          {/* Fonte (dinâmico) */}
          {uniqueSources.length > 0 && (
            <div className={styles.filterGroup}>
              <div className={styles.filterGroupLabel}>
                <RadioTower size={13} />
                {tx.source}
              </div>
              <div className={styles.filterChipGrid}>
                <button
                  className={`${styles.filterChip} ${!sourceFilter ? styles.filterChipActive : ''}`}
                  onClick={() => onSourceChange(null)}
                >
                  {tx.allSources}
                </button>
                {uniqueSources.map((src) => (
                  <button
                    key={src}
                    className={`${styles.filterChip} ${sourceFilter === src ? styles.filterChipActive : ''}`}
                    onClick={() => onSourceChange(sourceFilter === src ? null : src)}
                  >
                    {src}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Apply */}
        <div className={styles.filterPanelFooter}>
          <button className={styles.filterApplyBtn} onClick={onClose}>
            {tx.applyFilters}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Library Client ───────────────────────────────────────────────────────────
export default function LibraryClient({ dict, lang }: LibraryClientProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [nicheFilter, setNicheFilter] = useState<SkillNiche | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const searchParams = useSearchParams();
  // Conta vinda da sessao do painel, nao so da query string.
  const { userId } = useSession();

  const isPt = lang === 'pt';
  const tx = useMemo(() => ({
    searchAndFilter: isPt ? 'Busca & Filtros' : 'Search & Filters',
    clear: isPt ? 'Limpar' : 'Clear',
    clearAll: isPt ? 'Limpar tudo' : 'Clear all',
    niche: isPt ? 'Nicho' : 'Niche',
    all: isPt ? 'Todos' : 'All',
    source: isPt ? 'Fonte' : 'Source',
    allSources: isPt ? 'Todas' : 'All',
    applyFilters: isPt ? 'Aplicar filtros' : 'Apply filters',
    filters: isPt ? 'Filtros' : 'Filters',
    noSkillsFound: isPt ? 'Nenhuma skill encontrada' : 'No skills found',
    adjustFilters: isPt ? 'Tente ajustar os filtros.' : 'Try adjusting your filters.',
  }), [isPt]);

  // Debounce da busca (300 ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  // SWR
  const apiUrl = BASE_URL;
  const buildKey = () => {
    const params = new URLSearchParams();
    // A conta vem do cookie; mandar o id na query so o expunha.
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (sourceFilter) params.set('source', sourceFilter);
    if (nicheFilter) params.set('niche', nicheFilter);
    return `${apiUrl}/api/skills?${params.toString()}`;
  };

  const { data: skills, error: fetchError } = useSWR<SkillSummary[]>(
    buildKey,
    fetcher,
    { refreshInterval: 10_000 }
  );

  const uniqueSources = useMemo(() => {
    if (!skills) return [];
    const names = skills.map((s) => s.channelName).filter((n): n is string => !!n);
    return Array.from(new Set(names));
  }, [skills]);

  const hasActiveFilters = !!debouncedSearch || !!sourceFilter || !!nicheFilter;

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSourceFilter(null);
    setNicheFilter(null);
  };

  // Conta filtros ativos (para o badge)
  const activeFilterCount = [debouncedSearch, sourceFilter, nicheFilter].filter(Boolean).length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.libraryTopRow}>
          <div>
            <h1 className={styles.title}>{dict.dashboard.libraryTitle}</h1>
            <p className={styles.subtitle}>{dict.dashboard.librarySubtitle}</p>
          </div>

          {/* Botão elegante de filtro */}
          <button
            id="library-filter-btn"
            className={`${styles.filterTrigger} ${hasActiveFilters ? styles.filterTriggerActive : ''}`}
            onClick={() => setFilterOpen(true)}
            aria-expanded={filterOpen}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={16} />
            <span>{tx.filters}</span>
            {activeFilterCount > 0 ? (
              <span className={styles.filterBadge}>{activeFilterCount}</span>
            ) : (
              <ChevronDown size={14} className={styles.filterChevron} />
            )}
          </button>
        </div>

        {/* Pills de filtros ativos — linha abaixo do header */}
        {hasActiveFilters && (
          <div className={styles.activePills}>
            {debouncedSearch && (
              <span className={styles.activePill}>
                <Search size={11} />
                &ldquo;{debouncedSearch}&rdquo;
                <button onClick={() => { setSearchInput(''); setDebouncedSearch(''); }}>
                  <X size={10} />
                </button>
              </span>
            )}
            {nicheFilter && (
              <span
                className={styles.activePill}
                style={{ '--pill-color': NICHE_COLOR[nicheFilter] } as React.CSSProperties}
              >
                <span
                  className={styles.activePillDot}
                  style={{ background: NICHE_COLOR[nicheFilter] }}
                />
                {NICHE_LABEL[nicheFilter]}
                <button onClick={() => setNicheFilter(null)}>
                  <X size={10} />
                </button>
              </span>
            )}
            {sourceFilter && (
              <span className={styles.activePill}>
                <RadioTower size={11} />
                {sourceFilter}
                <button onClick={() => setSourceFilter(null)}>
                  <X size={10} />
                </button>
              </span>
            )}
            <button className={styles.activePillsClear} onClick={clearFilters}>
              {tx.clearAll}
            </button>
          </div>
        )}
      </header>

      {/* Modal de filtro */}
      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        nicheFilter={nicheFilter}
        onNicheChange={setNicheFilter}
        sourceFilter={sourceFilter}
        onSourceChange={setSourceFilter}
        uniqueSources={uniqueSources}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        searchPlaceholder={dict.dashboard.searchSkills}
        tx={tx}
      />

      {/* GRID DE SKILLS */}
      <div className={styles.librarySection}>
        {fetchError && <p className={styles.fetchError}>{dict.dashboard.fetchError}</p>}
        {!skills && !fetchError && <p className={styles.loading}>{dict.dashboard.loading}</p>}

        {skills && skills.length === 0 && (
          <div className={styles.emptyState}>
            <PlaySquare size={48} className={styles.emptyIcon} />
            <h3>{hasActiveFilters ? tx.noSkillsFound : dict.dashboard.emptyTitle}</h3>
            <p>{hasActiveFilters ? tx.adjustFilters : dict.dashboard.emptyDesc}</p>
          </div>
        )}

        {skills && skills.length > 0 && (
          <div className={styles.grid}>
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} lang={lang} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
