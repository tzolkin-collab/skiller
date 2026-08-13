import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import styles from '../LandingPageClient/LandingPageClient.module.css';

interface HeroSectionProps {
  lang: string;
  setIsVideoModalOpen: (open: boolean) => void;
}

export function HeroSection({ lang, setIsVideoModalOpen }: HeroSectionProps) {
  const router = useRouter();

  return (
    <section id="hero" className={styles.heroSection}>
      <motion.h1 
        className={styles.heroTitle}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.5, ease: [0.76, 0, 0.24, 1] }}
      >
        SKILLER
      </motion.h1>
      <motion.p 
        className={styles.heroSubtitle}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.6, ease: [0.76, 0, 0.24, 1] }}
      >
        Build playlists into actionable intelligence.
      </motion.p>
      <motion.div 
        className={styles.heroActions}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.7, ease: [0.76, 0, 0.24, 1] }}
      >
        <button className={styles.primaryBtn} onClick={() => router.push(`/${lang}/pricing`)}>Start Building</button>
        <button className={styles.secondaryBtn} onClick={() => setIsVideoModalOpen(true)}>View Demo</button>
      </motion.div>
    </section>
  );
}
