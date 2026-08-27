'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import type { Dictionary } from '@/types/dictionary';
import { VideoCard } from '@/components/ui/VideoCard/VideoCard';
import { FilterChips } from '@/components/ui/FilterChips/FilterChips';
import { ShortsShelf } from '@/components/ui/ShortsShelf/ShortsShelf';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { SearchAutocomplete } from '@/components/ui/SearchAutocomplete/SearchAutocomplete';
import { SourceSelector } from '@/components/ui/SourceSelector/SourceSelector';
import { useLayoutState } from '@/store/layoutState';
import { FloatingCart } from '@/components/ui/FloatingCart/FloatingCart';
import { useCart } from '@/components/providers/CartProvider';
import styles from './page.module.css';
import useSWRInfinite from 'swr/infinite';

interface DashboardClientProps {
  dict: Dictionary;
  lang: string;
  initialQuery?: string;
  editSkillId?: string;
}

//  manda o cookie de sessão; sem ele o backend
// devolve 401 em toda rota autenticada.
const fetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((res) => res.json());

export const FILTER_CHIPS = ['All', 'AI & Machine Learning', 'Next.js', 'Python', 'Productivity', 'Startups', 'Figma'];

export default function DashboardClient({ dict, lang, initialQuery, editSkillId }: DashboardClientProps) {
  const { setIsSearchInHeader, activeFilter, setActiveFilter, activeSourceTab, setActiveSourceTab } = useLayoutState();
  const [activeQuery, setActiveQuery] = useState('');
  
  // Recent searches fallback logic
  useEffect(() => {
    let finalQuery = initialQuery;
    
    // If the query is empty, we try to use recent searches
    if (!finalQuery || finalQuery.trim() === '') {
      try {
        const history = JSON.parse(localStorage.getItem('skiller_recent_searches') || '[]');
        if (history && history.length > 0) {
          // Pick a random recent search to make the default feed dynamic
          finalQuery = history[Math.floor(Math.random() * history.length)];
        } else {
          finalQuery = 'AI Agent Tutorial';
        }
      } catch {
        finalQuery = 'AI Agent Tutorial';
      }
    } else {
      // Save the new valid query to recent searches
      try {
        const history = JSON.parse(localStorage.getItem('skiller_recent_searches') || '[]');
        const newHistory = [finalQuery, ...history.filter((q: string) => q !== finalQuery)].slice(0, 5);
        localStorage.setItem('skiller_recent_searches', JSON.stringify(newHistory));
      } catch (e) {
        // ignore storage errors
      }
    }

    const safeQuery = finalQuery || '';
    setActiveQuery(safeQuery);
    setActiveFilter(FILTER_CHIPS.includes(safeQuery) ? safeQuery : 'All');
  }, [initialQuery, setActiveFilter]);

  const { selectedUrls, toggleUrl } = useCart();
  const router = useRouter();

  // Infinite Scroll setup
  const { data, error: swrError, size, setSize, isValidating } = useSWRInfinite(
    (pageIndex, previousPageData) => {
      if (!activeQuery) return null; // Wait for activeQuery to be set
      // Reached the end
      if (previousPageData && !previousPageData.videos?.length) return null;
      return `${process.env.NEXT_PUBLIC_API_URL}/api/youtube/search?q=${encodeURIComponent(activeQuery)}&page=${pageIndex + 1}`;
    },
    fetcher,
    { 
      revalidateOnFocus: false,
      revalidateFirstPage: false, // Prevents yt-search non-deterministic results from rewriting the whole grid and blinking
      persistSize: true,
      revalidateAll: false
    }
  );

  useEffect(() => {
    if (activeQuery) {
      setSize(1);
    }
  }, [activeQuery, setSize]);

  const { ref, inView } = useInView({
    rootMargin: '200px', // Trigger slightly before reaching the bottom
  });

  useEffect(() => {
    if (inView && !isValidating && data && data.length > 0) {
      setSize(size + 1);
    }
  }, [inView, isValidating, setSize, size, data]);

  const handleVideoClick = (videoId: string) => {
    const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;
    toggleUrl(fullUrl);
  };

  const handleChipSelect = (chip: string) => {
    let nextQuery = chip;
    if (chip === 'All') {
      try {
        const history = JSON.parse(localStorage.getItem('skiller_recent_searches') || '[]');
        nextQuery = history.length > 0 ? history[Math.floor(Math.random() * history.length)] : 'AI Agent Tutorial';
      } catch {
        nextQuery = 'AI Agent Tutorial';
      }
    }
    setActiveFilter(chip);
    setActiveQuery(nextQuery);
  };

  // Deduplicate and flatten data
  const rawVideos = data ? data.flatMap(page => page?.videos || []) : [];
  const rawShorts = data ? data.flatMap(page => page?.shorts || []) : [];
  
  const allVideos = Array.from(new Map(rawVideos.map(v => [v.id, v])).values());
  const allShorts = Array.from(new Map(rawShorts.map(s => [s.id, s])).values());

  const { isSearchInHeader } = useLayoutState();
  const isScrolled = isSearchInHeader;

  return (
    <div className={styles.container}>
      {/* Top Controls: Fixed minHeight prevents layout shift when search bar unmounts, fixing the scroll loop */}
      <header className={styles.header} style={{ minHeight: '120px' }}>
        <AnimatePresence>
          {!isScrolled && (
            <motion.div
              layoutId="global-search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <SourceSelector 
                language={lang} 
                activeTab={activeSourceTab}
                onTabChange={setActiveSourceTab} 
              >
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <SearchAutocomplete language={lang} />
                </div>
              </SourceSelector>
            </motion.div>
          )}
        </AnimatePresence>
        
        <AnimatePresence>
          {!isScrolled && activeSourceTab === 'youtube' && (
            <motion.div
              layoutId="global-filters"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <FilterChips 
                chips={FILTER_CHIPS} 
                activeChip={activeFilter} 
                onSelectChip={setActiveFilter} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Video Grid */}
      {activeSourceTab === 'youtube' && (
      <main className={styles.mainGrid}>
        <h2 className={styles.gridTitle}>Recommended For You</h2>
        <div className={styles.videoGrid}>
          {allVideos.map((video, index) => {
            const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
            const isSelected = selectedUrls.includes(videoUrl);
            return (
              <React.Fragment key={`${video.id}-${index}`}>
                <VideoCard 
                  videoId={video.id}
                  title={video.title}
                  channel={video.channel}
                  channelAvatar={video.channelAvatar}
                  views={video.views}
                  timeAgo={video.timeAgo}
                  duration={video.duration}
                  onClick={handleVideoClick}
                  isSelected={isSelected}
                />
                {/* Insert Shorts Shelf after 8th video (if available) */}
                {index === 7 && allShorts.length > 0 && (
                  <ShortsShelf 
                    shorts={allShorts} 
                    onVideoClick={handleVideoClick}
                    selectedUrls={selectedUrls}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
        
        {/* Infinite Scroll trigger */}
        <div ref={ref} style={{ height: '40px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', display: isValidating ? 'inline' : 'none' }}>Loading more...</span>
          {isValidating && size > 1 && (
            <div className={styles.loadingMore}>Loading more recommendations...</div>
          )}
        </div>
        <div ref={ref} style={{ height: '20px', width: '100%' }} />
      </main>
      )}

      {activeSourceTab === 'youtube' && <FloatingCart language={lang} editSkillId={editSkillId} />}
    </div>
  );
}
