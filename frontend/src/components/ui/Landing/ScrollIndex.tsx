import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { useSmoothScrollTo } from '../SmoothScroll/SmoothScroll';
import styles from '../LandingPageClient/LandingPageClient.module.css';

const SECTIONS = [
  { id: 'hero', label: '01. Intro' },
  { id: 'features', label: '02. Features' },
  { id: 'carousel', label: '03. Gallery' },
];

export function ScrollIndex() {
  const [activeSection, setActiveSection] = useState('hero');
  const scrollToSection = useSmoothScrollTo();
  const { scrollYProgress } = useScroll();
  const scaleY = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-50% 0px -50% 0px' } // Trigger exactly at the middle of the screen
    );

    SECTIONS.forEach((sec) => {
      const el = document.getElementById(sec.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.scrollIndexContainer}>
      <div className={styles.scrollIndexLabels}>
        {SECTIONS.map((sec) => (
          <div 
            key={sec.id} 
            className={`${styles.scrollIndexLabel} ${activeSection === sec.id ? styles.active : ''}`}
            onClick={() => {
              const target = document.getElementById(sec.id);
              if (target) scrollToSection(target);
            }}
          >
            {sec.label}
          </div>
        ))}
      </div>
      
      {/* Brutalist Thin Scrollbar Track */}
      <div className={styles.scrollBarTrack}>
        <motion.div 
          className={styles.scrollBarThumb} 
          style={{ scaleY }} 
        />
      </div>
    </div>
  );
}
