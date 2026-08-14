import { useRouter, useParams } from 'next/navigation';
import { Play, Plus, Check } from 'lucide-react';
import styles from './ShortCard.module.css';

interface ShortCardProps {
  videoId: string;
  title: string;
  channel: string;
  views: string;
  onClick: (videoId: string) => void;
  isSubmitting?: boolean;
  isSelected?: boolean;
}

export function ShortCard({ videoId, title, channel, views, onClick, isSubmitting, isSelected }: ShortCardProps) {
  const router = useRouter();
  const params = useParams();
  const lang = params.lang || 'en';

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSubmitting) return;
    router.push(`/${lang}/dashboard/watch?v=${videoId}`);
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSubmitting) onClick(videoId);
  };

  return (
    <div className={`${styles.card} ${isSubmitting ? styles.submitting : ''} ${isSelected ? styles.selected : ''}`} onClick={handleCardClick}>
      <div className={styles.thumbnailContainer}>
        <img 
          src={thumbnailUrl} 
          alt={title} 
          className={styles.thumbnail} 
          onError={(e) => { e.currentTarget.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; }}
        />
        
        <button 
          className={`${styles.selectBtn} ${isSelected ? styles.selectBtnActive : ''}`}
          onClick={handleSelectClick}
          title={isSelected ? "Remove from Skill" : "Add to Skill"}
        >
          {isSelected ? <Check size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={3} />}
        </button>

        <div className={styles.overlay}>
          <div className={styles.overlayPlay}>
            <Play fill="white" size={24} />
          </div>
        </div>
      </div>
      <div className={styles.info}>
        <h3 className={styles.title} title={title}>{title}</h3>
        <p className={styles.stats}>{views}</p>
      </div>
    </div>
  );
}
