'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Logo } from '../Logo/Logo';
import styles from '../LandingPageClient/LandingPageClient.module.css';

/**
 * Module-level so the intro plays once per page load. Client-side navigation
 * back to the landing remounts the component, and replaying a 1.8s curtain on
 * every return is noise.
 */
let hasPlayed = false;

export function LiquidLoader() {
  const [isDone, setIsDone] = useState(hasPlayed);

  // Unmounting is what removes the curtain. The previous version set
  // `display: none` imperatively on a React-owned node, which left React and
  // the DOM disagreeing about the tree.
  if (isDone) return null;

  return (
    <motion.div
      className={styles.loaderContainer}
      animate={{ y: '-100%' }}
      transition={{ duration: 0.6, delay: 1.2, ease: [0.76, 0, 0.24, 1] }}
      onAnimationComplete={() => {
        hasPlayed = true;
        setIsDone(true);
      }}
    >
      <div className={styles.loaderLayerDark}>
        <Logo size={80} style={{ color: 'var(--accent-primary)' }} />
      </div>

      <motion.div
        className={styles.loaderLayerRed}
        initial={{ clipPath: 'inset(100% 0px 0px 0px)' }}
        animate={{ clipPath: 'inset(0% 0px 0px 0px)' }}
        transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
      >
        <Logo size={80} style={{ color: 'var(--bg-primary)' }} />
      </motion.div>
    </motion.div>
  );
}
