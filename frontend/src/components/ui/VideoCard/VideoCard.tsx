import { useRouter, useParams } from 'next/navigation';
import { Play, Plus, Check } from 'lucide-react';
import styles from './VideoCard.module.css';

interface VideoCardProps {
  videoId: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  views: string;
  timeAgo: string;
  duration: string;
  onClick: (videoId: string) => void;
  isSubmitting?: boolean;
  isSelected?: boolean;
}

export function VideoCard({ videoId, title, channel, channelAvatar, views, timeAgo, duration, onClick, isSubmitting, isSelected }: VideoCardProps) {
  const router = useRouter();
  const params = useParams();
  const lang = params.lang || 'en';

  // Use hqdefault instead of maxresdefault to ensure the image always exists
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

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
        <img src={thumbnailUrl} alt={title} className={styles.thumbnail} />
        <div className={styles.duration}>{duration}</div>
        
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
        {channelAvatar ? (
          <img src={channelAvatar} alt={channel} className={styles.avatarImg} />
        ) : (
          <div className={styles.avatar}>{channel.charAt(0)}</div>
        )}
        <div className={styles.meta}>
          <h3 className={styles.title} title={title}>{title}</h3>
          <p className={styles.channel}>{channel}</p>
          <p className={styles.stats}>{views} • {timeAgo}</p>
        </div>
      </div>
    </div>
  );
}
