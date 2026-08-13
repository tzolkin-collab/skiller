import { motion } from 'framer-motion';
import type { Dictionary } from '@/types/dictionary';
import styles from '../LandingPageClient/LandingPageClient.module.css';

interface FeaturesSectionProps {
  dict: Dictionary['landing'];
}

export function FeaturesSection({ dict }: FeaturesSectionProps) {
  // Each feature description is stored as "Lead line\nBody copy".
  const features = [
    { title: dict.feature1Title, desc: dict.feature1Desc },
    { title: dict.feature2Title, desc: dict.feature2Desc },
    { title: dict.feature3Title, desc: dict.feature3Desc },
  ].map(({ title, desc }) => {
    const [lead, ...rest] = desc.split('\n');
    return { title, lead, body: rest.join(' ') };
  });

  return (
    <motion.section
      id="features"
      className={styles.featuresSection}
      initial={{ y: 40, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
    >
      <h2 className={styles.featuresTitle}>{dict.featuresTitle}</h2>
      <p className={styles.featuresSubtitle}>{dict.featuresSubtitle}</p>

      <div className={styles.featureGrid}>
        {features.map((feat) => (
          <div key={feat.title} className={styles.featureCard}>
            <h3 className={styles.featureTitle}>{feat.title}</h3>
            <p className={styles.featureLead}>{feat.lead}</p>
            <p className={styles.featureDesc}>{feat.body}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
