'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent } from 'react';
import Image from 'next/image';
import { useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Marquee } from './Marquee';
import type { Dictionary } from '@/types/dictionary';
import styles from './HomeSlider.module.css';

/**
 * Full-viewport home slider, modelled on the asiaxp.co home.
 *
 * The page does not scroll: the wheel drives the slider, and there is nothing
 * below it. Timings match the reference — 6s autoplay, 1s crossfade, 1s wheel
 * throttle, 800ms `.leave` hold and a 1.2s interaction lock.
 */
const AUTOPLAY_DELAY = 6000;
const NAV_THROTTLE = 1000;
const LEAVE_DURATION = 800;
const UNLOCK_DELAY = 1200;
const SWIPE_THRESHOLD = 50;

type Direction = 'next' | 'prev';

interface SlideVisual {
  image: string | null;
  color: string;
}

/** Art direction per slide. Index 0 is the brand slide, which carries no image. */
const SLIDE_VISUALS: SlideVisual[] = [
  { color: 'var(--accent-primary)', image: null }, // Brand
  { color: '#FF3333', image: '/assets/slider/ingestion.svg' },
  { color: '#FF3333', image: '/assets/slider/extraction.svg' },
  { color: '#FF3333', image: '/assets/slider/synthesis.svg' },
  { color: '#FF3333', image: '/assets/slider/output.svg' },
];

type SlideStyle = CSSProperties & Record<'--slide-color', string>;
type StaggerStyle = CSSProperties & Record<'--i', number>;

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Splits text into per-word masks. Each word sits in an `overflow: hidden`
 * box and travels out of it, so the type is revealed by an edge rather than
 * sliding through empty space — the effect asiaxp gets from its
 * `.line-1 > span` markup.
 */
function MaskedWords({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      {text
        .split(/\s+/)
        .filter(Boolean)
        .map((word, i) => (
          <span key={`${word}-${i}`} className={styles.wordMask}>
            <span className={styles.word} style={{ '--i': start + i } as StaggerStyle}>
              {word}
            </span>
          </span>
        ))}
    </>
  );
}

interface HomeSliderProps {
  dict: Dictionary;
  lang: string;
  onOpenDemo: () => void;
  /** True while an overlay owns the screen — the slider must not react then. */
  paused: boolean;
}

export function HomeSlider({ dict, lang, onOpenDemo, paused }: HomeSliderProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  // The brand slide is rendered from the existing landing copy; the rest come
  // from the carousel dictionary. Total count drives navigation and pagination.
  const contentSlides = dict.carousel.slides;
  const slideCount = contentSlides.length + 1;
  const brandWords = countWords(dict.landing.title1) + countWords(dict.landing.title2);

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>('next');
  const [leavingIndex, setLeavingIndex] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const indexRef = useRef(0);
  const lastNavRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  /** Wraps around in both directions, matching Swiper's `rewind`. */
  const wrap = useCallback(
    (target: number) => (target + slideCount) % slideCount,
    [slideCount]
  );

  const goTo = useCallback(
    (rawTarget: number, dir: Direction) => {
      // Prevent overlapping transitions if fired too quickly
      if (performance.now() - lastNavRef.current < NAV_THROTTLE) return;

      const current = indexRef.current;
      const target = wrap(rawTarget);
      if (target === current) return;

      lastNavRef.current = performance.now();
      indexRef.current = target;

      setDirection(dir);
      setLeavingIndex(current);
      setIndex(target);
      setIsLocked(true);

      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [
        window.setTimeout(() => setLeavingIndex(null), LEAVE_DURATION),
        window.setTimeout(() => setIsLocked(false), UNLOCK_DELAY)
      ];
    },
    [wrap]
  );

  useEffect(() => {
    const timers = timersRef;
    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
  }, []);

  // Autoplay. Restarts on every index change, so any manual navigation resets
  // it. Suspended behind overlays, and never runs for reduced-motion users —
  // an auto-advancing carousel is exactly what that setting asks us to stop.
  // We also stop it permanently if the user interacts with the slider.
  useEffect(() => {
    if (paused || prefersReducedMotion || hasInteracted) return;
    const timer = window.setTimeout(() => {
      goTo(indexRef.current + 1, 'next');
    }, AUTOPLAY_DELAY);
    return () => window.clearTimeout(timer);
  }, [index, goTo, paused, prefersReducedMotion, hasInteracted]);

  /**
   * The wheel is the primary navigation. Nothing releases it — the page has no
   * scroll of its own, so every wheel event belongs to the slider.
   */
  /**
   * Bound to the window, not to the slider element: the page has no scroll of
   * its own, so a wheel anywhere — including over the 80px sidebar — belongs to
   * the slider. While an overlay is open the listener is simply not attached.
   */
  const wheelTimeoutRef = useRef<number | null>(null);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (paused) return;
    
    // Clear the timeout indicating the end of the scroll gesture
    if (wheelTimeoutRef.current) {
      window.clearTimeout(wheelTimeoutRef.current);
    }

    // If we are not currently in a scroll gesture block, navigate!
    if (!wheelTimeoutRef.current) {
      setHasInteracted(true);
      const dir: Direction = event.deltaY > 0 ? 'next' : 'prev';
      goTo(indexRef.current + (dir === 'next' ? 1 : -1), dir);
    }

    // Set a timeout to unlock wheel navigation once the momentum events stop coming
    wheelTimeoutRef.current = window.setTimeout(() => {
      wheelTimeoutRef.current = null;
    }, 150);
  };

  useEffect(() => {
    if (paused) return;

    const handleKey = (event: KeyboardEvent) => {
      // Arrow keys belong to whatever field has focus, not to the slider.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') {
        setHasInteracted(true);
        goTo(indexRef.current + 1, 'next');
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
        setHasInteracted(true);
        goTo(indexRef.current - 1, 'prev');
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goTo, paused]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (paused) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start || paused) return;
    touchStartRef.current = null;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    // With no page scroll, a vertical swipe navigates too — like the wheel.
    const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
    const delta = horizontal ? deltaX : deltaY;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;

    if (delta < 0) {
      setHasInteracted(true);
      goTo(indexRef.current + 1, 'next');
    } else {
      setHasInteracted(true);
      goTo(indexRef.current - 1, 'prev');
    }
  };

  const slideClassName = (i: number, visual: SlideVisual, extra?: string) =>
    [
      styles.slide,
      visual.image ? styles.slideWithMedia : styles.slideTypographic,
      extra,
      i === index ? styles.active : '',
      i === leavingIndex ? styles.leave : '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div
      className={styles.root}
      data-slider-state={direction}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-roledescription="carousel"
    >
      <div className={`${styles.viewport} ${isLocked ? styles.locked : ''}`}>
        {/* Slide 0 — brand */}
        <article
          className={slideClassName(0, SLIDE_VISUALS[0], styles.slideBrand)}
          style={{ '--slide-color': SLIDE_VISUALS[0].color } as SlideStyle}
          aria-hidden={index !== 0}
          /* Without `inert` the CTAs on hidden slides stay in the tab order. */
          inert={index !== 0}
          aria-roledescription="slide"
          aria-label={`1 / ${slideCount}`}
        >
          <div className={styles.slideInner}>
            <div className={styles.textWrapper}>
              <span className={`${styles.eyebrow} ${styles.reveal}`} style={{ '--i': 0 } as StaggerStyle}>
                {dict.landing.badge}
              </span>
              <h1 className={styles.brandTitle}>
                <span className={styles.brandLine}>
                  <MaskedWords text={dict.landing.title1} start={1} />
                </span>
                <span className={`${styles.brandLine} ${styles.brandAccent}`}>
                  <MaskedWords text={dict.landing.title2} start={1 + countWords(dict.landing.title1)} />
                </span>
              </h1>
              <p
                className={`${styles.description} ${styles.reveal}`}
                style={{ '--i': 2 + brandWords } as StaggerStyle}
              >
                {dict.landing.subtitle}
              </p>
              <div
                className={`${styles.actions} ${styles.reveal}`}
                style={{ '--i': 3 + brandWords } as StaggerStyle}
              >
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => router.push(`/${lang}/pricing`)}
                >
                  {dict.landing.ctaStart}
                </button>
                <button type="button" className={styles.secondaryBtn} onClick={onOpenDemo}>
                  {dict.carousel.ctaDemo}
                </button>
              </div>
            </div>
          </div>

          <div
            className={`${styles.marqueeWrapper} ${styles.reveal}`}
            style={{ '--i': 4 + brandWords } as StaggerStyle}
          >
            <Marquee text={dict.carousel.brandMarquee} />
          </div>
        </article>

        {/* Slides 1..n — pipeline */}
        {contentSlides.map((slide, i) => {
          const slideIndex = i + 1;
          const visual = SLIDE_VISUALS[slideIndex % SLIDE_VISUALS.length];

          return (
            <article
              key={slide.eyebrow}
              className={slideClassName(slideIndex, visual)}
              style={{ '--slide-color': visual.color } as SlideStyle}
              aria-hidden={slideIndex !== index}
              inert={slideIndex !== index}
              aria-roledescription="slide"
              aria-label={`${slideIndex + 1} / ${slideCount}`}
            >
              <div className={styles.slideInner}>
                <div className={styles.textWrapper}>
                  <span className={`${styles.eyebrow} ${styles.reveal}`} style={{ '--i': 0 } as StaggerStyle}>
                    {slide.eyebrow}
                  </span>
                  <h2 className={styles.title}>
                    <MaskedWords text={slide.title} start={1} />
                  </h2>
                  <p
                    className={`${styles.description} ${styles.reveal}`}
                    style={{ '--i': 2 + countWords(slide.title) } as StaggerStyle}
                  >
                    {slide.description}
                  </p>
                  <span
                    className={`${styles.cta} ${styles.reveal}`}
                    style={{ '--i': 3 + countWords(slide.title) } as StaggerStyle}
                  >
                    {dict.carousel.cta}
                  </span>
                </div>

                {visual.image && (
                  <div className={styles.mediaWrapper}>
                    <div className={styles.mediaInner}>
                      <Image
                        src={visual.image}
                        alt=""
                        fill
                        priority={true}
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        className={styles.media}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div
                className={`${styles.marqueeWrapper} ${styles.reveal}`}
                style={{ '--i': 4 + countWords(slide.title) } as StaggerStyle}
              >
                <Marquee text={slide.marquee} reverse={slideIndex % 2 === 1} />
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles.controls}>
        <span className={styles.counter}>
        </span>

        <div className={styles.pagination}>
          {Array.from({ length: slideCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.bullet} ${i === index ? styles.bulletActive : ''}`}
              aria-label={`${i + 1} / ${slideCount}`}
              aria-current={i === index}
              onClick={() => {
                setHasInteracted(true);
                goTo(i, i > indexRef.current ? 'next' : 'prev');
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
