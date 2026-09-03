import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Play, Plus, Check, ThumbsUp, MessageCircle, TrendingUp } from 'lucide-react';
import styles from './VideoCard.module.css';

interface VideoCardProps {
  videoId: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  subscribers?: string;
  views: string;
  timeAgo: string;
  duration: string;
  likes?: string;
  comments?: string;
  engagement?: number;
  onClick: (videoId: string) => void;
  isSubmitting?: boolean;
  isSelected?: boolean;
}

export function VideoCard({ videoId, title, channel, channelAvatar, subscribers, views, timeAgo, duration, likes, comments, engagement, onClick, isSubmitting, isSelected }: VideoCardProps) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const lang = params.lang || 'en';
  
  const editSkillId = searchParams.get('editSkillId');

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSubmitting) return;
    const url = `/${lang}/dashboard/watch?v=${videoId}${editSkillId ? `&editSkillId=${editSkillId}` : ''}`;
    router.push(url);
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSubmitting) onClick(videoId);
  };

  // Color the engagement badge based on rate
  const engagementColor = engagement && engagement >= 5
    ? 'var(--success, #22c55e)'
    : engagement && engagement >= 2
      ? 'var(--accent-primary, #3b82f6)'
      : 'var(--text-secondary, #aaa)';

  return (
    <div className={`${styles.card} ${isSubmitting ? styles.submitting : ''} ${isSelected ? styles.selected : ''}`} onClick={handleCardClick}>
      <div className={styles.thumbnailContainer}>
        <Image src={thumbnailUrl} alt={title} width={320} height={180} className={styles.thumbnail} unoptimized />
        <div className={styles.duration}>{duration}</div>
        
        <button 
          className={`${styles.selectBtn} ${isSelected ? styles.selectBtnActive : ''}`}
          onClick={handleSelectClick}
          title={isSelected ? "Remove from Skill" : "Add to Skill"}
        >
          {isSelected ? <Check size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={3} />}
        </button>

        {/* Engagement overlay on hover */}
        {(likes || comments) && (
          <div className={styles.engagementBar}>
            {likes && (
              <span className={styles.engagementItem}>
                <ThumbsUp size={12} />
                {likes}
              </span>
            )}
            {comments && (
              <span className={styles.engagementItem}>
                <MessageCircle size={12} />
                {comments}
              </span>
            )}
            {engagement !== undefined && engagement > 0 && (
              <span className={styles.engagementItem} style={{ color: engagementColor }}>
                <TrendingUp size={12} />
                {engagement}%
              </span>
            )}
          </div>
        )}

        <div className={styles.overlay}>
          <div className={styles.overlayPlay}>
            <Play fill="white" size={24} />
          </div>
        </div>
      </div>
      <div className={styles.info}>
        {channelAvatar ? (
          <Image src={channelAvatar} alt={channel} width={36} height={36} className={styles.avatarImg} referrerPolicy="no-referrer" unoptimized />
        ) : (
          <div className={styles.avatar}>{channel.charAt(0)}</div>
        )}
        <div className={styles.meta}>
          <h3 className={styles.title} title={title}>{title}</h3>
          <p className={styles.channel}>
            {channel}
            {subscribers && <span className={styles.subs}> · {subscribers}</span>}
          </p>
          <p className={styles.stats}>{views} • {timeAgo}</p>
        </div>
      </div>
    </div>
  );
}

