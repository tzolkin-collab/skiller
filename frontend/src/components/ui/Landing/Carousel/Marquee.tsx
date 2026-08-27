'use client';

import styles from './Marquee.module.css';

interface MarqueeProps {
  text: string;
  speed?: number; // Kept for prop compatibility, but handled via CSS duration
  reverse?: boolean;
  pauseOnHover?: boolean;
}

import { memo } from 'react';

export const Marquee = memo(function Marquee({
  text,
  reverse = false,
  pauseOnHover = true,
}: MarqueeProps) {
  // We repeat the text enough times to guarantee it covers the widest possible screen.
  // We then render two identical blocks of this repeated text.
  const copies = Array.from({ length: 20 }, () => text);

  return (
    <div
      className={`${styles.marquee} ${pauseOnHover ? styles.pauseOnHover : ''}`}
      aria-hidden="true"
    >
      <div className={`${styles.track} ${reverse ? styles.reverse : ''}`}>
        <div className={styles.content}>
          {copies.map((t, i) => (
            <span key={`first-${i}`} className={styles.copy}>{t}</span>
          ))}
        </div>
        <div className={styles.content}>
          {copies.map((t, i) => (
            <span key={`second-${i}`} className={styles.copy}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
});
