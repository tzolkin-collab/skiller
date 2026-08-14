'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchAutocomplete } from '@/components/ui/SearchAutocomplete/SearchAutocomplete';
import { FloatingCart } from '@/components/ui/FloatingCart/FloatingCart';
import { VideoCard } from '@/components/ui/VideoCard/VideoCard';
import { useCart } from '@/components/providers/CartProvider';
import { Plus, Check, ArrowLeft } from 'lucide-react';
import styles from './WatchClient.module.css';

interface Dictionary {
  [key: string]: unknown;
}

interface WatchClientProps {
  dict: Dictionary;
  lang: string;
  videoId: string;
}

interface VideoDetails {
  id: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  views: string;
  description: string;
  uploadDate: string;
}

interface SuggestedVideo {
  id: string;
  title: string;
  channel: string;
  views: string;
  timeAgo: string;
  duration: string;
}

export default function WatchClient({ dict, lang, videoId }: WatchClientProps) {
  const router = useRouter();
  const { selectedUrls, toggleUrl } = useCart();
  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [suggestedVideos, setSuggestedVideos] = useState<SuggestedVideo[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const isSelected = selectedUrls.includes(videoUrl);

  useEffect(() => {
    async function fetchVideo() {
      try {
        setLoading(true);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/youtube/video?v=${videoId}`);
        if (!res.ok) throw new Error('Failed to fetch video');
        const data = await res.json();
        setVideo(data);
        
        // Fetch suggested videos based on the channel name
        fetchSuggested(data.channel);
      } catch (err) {
        setError('Error loading video details');
      } finally {
        setLoading(false);
      }
    }
    
    async function fetchSuggested(channelQuery: string) {
      try {
        setLoadingSuggested(true);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/youtube/search?q=${encodeURIComponent(channelQuery)}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out the current video
          const filtered = (data.videos || []).filter((v: SuggestedVideo) => v.id !== videoId).slice(0, 8);
          setSuggestedVideos(filtered);
        }
      } catch (err) {
        console.error('Failed to load suggested videos', err);
      } finally {
        setLoadingSuggested(false);
      }
    }

    fetchVideo();
  }, [videoId]);

  const handleToggleCart = () => {
    toggleUrl(videoUrl);
  };

  const handleToggleSuggested = (id: string) => {
    toggleUrl(`https://www.youtube.com/watch?v=${id}`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={24} />
        </button>
        <div style={{ flex: 1, maxWidth: '600px', margin: '0 auto' }}>
          <SearchAutocomplete language={lang} />
        </div>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.playerSection}>
          <div className={styles.playerContainer}>
            <iframe 
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`} 
              title="YouTube video player" 
              frameBorder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen
              className={styles.iframe}
            ></iframe>
          </div>

          {loading ? (
            <div className={styles.loadingSkeleton}>Loading details...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : video && (
            <div className={styles.videoDetails}>
              <h1 className={styles.title}>{video.title}</h1>
              
              <div className={styles.metaRow}>
                <div className={styles.channelInfo}>
                  {video.channelAvatar ? (
                    <img src={video.channelAvatar} alt={video.channel} className={styles.avatarImg} />
                  ) : (
                    <div className={styles.avatar}>{video.channel.charAt(0)}</div>
                  )}
                  <div className={styles.channelText}>
                    <p className={styles.channelName}>{video.channel}</p>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button 
                    className={`${styles.cartBtn} ${isSelected ? styles.cartBtnActive : ''}`}
                    onClick={handleToggleCart}
                  >
                    {isSelected ? (
                      <>
                        <Check size={20} />
                        No Caderno
                      </>
                    ) : (
                      <>
                        <Plus size={20} />
                        Add ao Caderno
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.descriptionBox}>
                <p className={styles.stats}>{video.views} views • {video.uploadDate}</p>
                <p className={styles.description}>{video.description}</p>
              </div>
            </div>
          )}
        </div>

        <div className={styles.recommendationsSection}>
          <h3 className={styles.recommendationsTitle}>Suggested</h3>
          {loadingSuggested ? (
            <div className={styles.placeholder}>Loading suggestions...</div>
          ) : suggestedVideos.length > 0 ? (
            <div className={styles.suggestedList}>
              {suggestedVideos.map((vid) => (
                <VideoCard
                  key={vid.id}
                  videoId={vid.id}
                  title={vid.title}
                  channel={vid.channel}
                  views={vid.views}
                  timeAgo={vid.timeAgo}
                  duration={vid.duration}
                  isSelected={selectedUrls.includes(`https://www.youtube.com/watch?v=${vid.id}`)}
                  onClick={handleToggleSuggested}
                />
              ))}
            </div>
          ) : (
            <div className={styles.placeholder}>
              No suggestions found.
            </div>
          )}
        </div>
      </main>

      {/* Renders the floating cart so user can generate the skill from here */}
      <FloatingCart language={lang} />
    </div>
  );
}
