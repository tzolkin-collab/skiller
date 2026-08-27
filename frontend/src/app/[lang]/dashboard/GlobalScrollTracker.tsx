'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useLayoutState } from '@/store/layoutState';

export function GlobalScrollTracker() {
  const { setIsSearchInHeader } = useLayoutState();
  const pathname = usePathname();
  const isScrolledRef = useRef(false);

  useEffect(() => {
    const scrollContainer = document.getElementById('main-scroll-container');
    if (!scrollContainer) return;

    const handleScroll = () => {
      const isDashboardPage = pathname === '/en/dashboard' || pathname === '/pt/dashboard' || pathname.includes('/watch');
      
      // Change threshold to 0 so it triggers instantly on the first pixel of scroll
      const scrolled = isDashboardPage && scrollContainer.scrollTop > 0;
      
      if (isScrolledRef.current !== scrolled) {
        isScrolledRef.current = scrolled;
        setIsSearchInHeader(scrolled);
      }
    };

    // Check immediately on mount and on route change
    handleScroll();
    
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [pathname, setIsSearchInHeader]);

  return null;
}
