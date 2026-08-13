'use client';

import { createContext, useCallback, useContext, useEffect, useRef, ReactNode } from 'react';
import Lenis from 'lenis';

type ScrollToFn = (target: HTMLElement) => void;

const nativeScrollTo: ScrollToFn = (target) => target.scrollIntoView({ behavior: 'smooth' });

const SmoothScrollContext = createContext<ScrollToFn>(nativeScrollTo);

/**
 * Scrolls an element into view through Lenis while it is running, falling back
 * to the native behaviour otherwise.
 *
 * Going through Lenis is not optional: while it is active it owns the scroll
 * position, so a plain `scrollIntoView` gets overwritten on the next frame.
 */
export function useSmoothScrollTo(): ScrollToFn {
  return useContext(SmoothScrollContext);
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const instance = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // exponential easing
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });

    lenisRef.current = instance;

    let frame = 0;
    function raf(time: number) {
      instance.raf(time);
      frame = requestAnimationFrame(raf);
    }
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      instance.destroy();
      lenisRef.current = null;
    };
  }, []);

  const scrollTo = useCallback<ScrollToFn>((target) => {
    if (lenisRef.current) lenisRef.current.scrollTo(target);
    else nativeScrollTo(target);
  }, []);

  return <SmoothScrollContext.Provider value={scrollTo}>{children}</SmoothScrollContext.Provider>;
}
