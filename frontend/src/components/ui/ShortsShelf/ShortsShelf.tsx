import React, { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { ShortCard } from '../ShortCard/ShortCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './ShortsShelf.module.css';

interface ShortVideo {
  id: string;
  title: string;
  channel: string;
  views: string;
}

interface ShortsShelfProps {
  shorts: ShortVideo[];
  onVideoClick: (videoId: string) => void;
  selectedUrls?: string[];
}

export function ShortsShelf({ shorts, onVideoClick, selectedUrls = [] }: ShortsShelfProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  if (!shorts || shorts.length === 0) return null;

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeft(scrollLeft > 0);
    setShowRight(scrollLeft + clientWidth < scrollWidth - 2);
  };

  useEffect(() => {
    handleScroll();
    window.addEventListener('resize', handleScroll);
    return () => window.removeEventListener('resize', handleScroll);
  }, [shorts]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = direction === 'left' ? -400 : 400;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  return (
    <div className={styles.shelfContainer}>
      <div className={styles.header}>
        <Image src="/icons/shorts-icon.svg" alt="Shorts" width={24} height={24} className={styles.icon} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <h2 className={styles.title}>Shorts</h2>
      </div>
      
      <div className={styles.carouselWrapper}>
        {showLeft && (
          <button className={`${styles.navBtn} ${styles.leftBtn}`} onClick={() => scroll('left')}>
            <ChevronLeft size={24} />
          </button>
        )}
        
        <div className={styles.scrollArea} ref={scrollRef} onScroll={handleScroll}>
          {shorts.map((short, index) => {
            const videoUrl = `https://www.youtube.com/watch?v=${short.id}`;
            const isSelected = selectedUrls.includes(videoUrl);
            return (
              <ShortCard
                key={`${short.id}-${index}`}
                videoId={short.id}
                title={short.title}
                channel={short.channel}
                views={short.views}
                onClick={onVideoClick}
                isSelected={isSelected}
              />
            );
          })}
        </div>

        {showRight && (
          <button className={`${styles.navBtn} ${styles.rightBtn}`} onClick={() => scroll('right')}>
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>
  );
}
