'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../LandingPageClient/LandingPageClient.module.css';
import type { Dictionary } from '@/types/dictionary';

interface VideoModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  dict: Dictionary;
}

export function VideoModal({ isOpen, setIsOpen, dict }: VideoModalProps) {
  // UseEffect removed in favor of React synthetic events

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className={styles.videoModalOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
          }}
          tabIndex={-1}
          ref={(node) => {
            // Auto-focus without useEffect
            if (node && !node.contains(document.activeElement)) {
              node.focus();
            }
          }}
        >
          <motion.div 
            className={styles.videoModalContent}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className={styles.videoCloseBtn} 
              onClick={() => setIsOpen(false)}
            >
              [ X ] {dict.nav.close}
            </button>
            
            <div className={styles.videoWrapper}>
              {/* Placeholder for the future Loom/MP4 */}
              <div className={styles.videoPlaceholder}>
                <div className={styles.playIcon}></div>
                <span>{dict.nav.demoVideo}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
