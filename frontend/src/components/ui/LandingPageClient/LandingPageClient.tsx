'use client';

import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { GlobalScene } from '../GlobalScene/GlobalScene';
import type { Dictionary } from '@/types/dictionary';
import styles from './LandingPageClient.module.css';

import { LiquidLoader } from '../Landing/LiquidLoader';
import { Sidebar } from '../Landing/Sidebar';
import { MenuOverlay } from '../Landing/MenuOverlay';
import { VideoModal } from '../Landing/VideoModal';
import { HomeSlider } from '../Landing/Carousel/HomeSlider';
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher';

interface LandingPageClientProps {
  dict: Dictionary;
  lang: string;
}

/**
 * The landing is a single viewport with no scroll of its own — the wheel drives
 * the slider, the same way asiaxp.co works. Nothing here may exceed 100dvh.
 */
export function LandingPageClient({ dict, lang }: LandingPageClientProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  return (
    <div className={styles.pageContainer}>
      {/* Global WebGL Background */}
      <div className={styles.sceneLayer}>
        <Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
          <GlobalScene />
        </Canvas>
      </div>

      {/* Global Overlays */}
      <LiquidLoader />
      <Sidebar setIsMenuOpen={setIsMenuOpen} dict={dict} />
      <MenuOverlay isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} lang={lang} dict={dict} />

      {/* Floating Controls */}
      <div className={styles.topRightControls}>
        <LanguageSwitcher align="right" variant="default" />
      </div>

      <main className={styles.mainContent}>
        <HomeSlider
          dict={dict}
          lang={lang}
          onOpenDemo={() => setIsVideoModalOpen(true)}
          paused={isMenuOpen || isVideoModalOpen}
        />
      </main>

      <VideoModal isOpen={isVideoModalOpen} setIsOpen={setIsVideoModalOpen} dict={dict} />
    </div>
  );
}
