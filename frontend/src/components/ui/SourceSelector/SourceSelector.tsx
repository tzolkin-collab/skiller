import React, { useState } from 'react';
import { Youtube, Github, Search, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import styles from './SourceSelector.module.css';

export function SourceSelector({ 
  language = 'en', 
  activeTab,
  onTabChange,
  isCompact = false,
  children
}: { 
  language?: string, 
  activeTab: 'youtube' | 'github' | 'google_search',
  onTabChange: (tab: 'youtube' | 'github' | 'google_search') => void,
  isCompact?: boolean,
  children?: React.ReactNode
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { userId } = useSession();

  const handleGenerate = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const endpoint = `${apiUrl}/api/skills`;
      
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: activeTab,
          sourceQuery: query,
          targetFormat: 'generic',
          language: language
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to submit job');
      }
      const data = await res.json();
      
      const querySuffix = '';
      if (data && data.id) {
        router.push(`/${language}/dashboard/skills/${data.id}${querySuffix}`);
      }
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Error creating skill. Check console.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.container} ${isCompact ? styles.compact : ''}`}>
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'youtube' ? styles.active : ''}`}
          onClick={() => onTabChange('youtube')}
          title="YouTube"
        >
          <Youtube size={16} /> {!isCompact && 'YouTube'}
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'github' ? styles.active : ''}`}
          onClick={() => onTabChange('github')}
          title="GitHub Repo"
        >
          <Github size={16} /> {!isCompact && 'GitHub Repo'}
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'google_search' ? styles.active : ''}`}
          onClick={() => onTabChange('google_search')}
          title="Google Search"
        >
          <Search size={16} /> {!isCompact && 'Google Search'}
        </button>
      </div>

      <div className={styles.inputArea}>
        {activeTab !== 'youtube' ? (
          <>
            <input 
              type="text" 
              placeholder={activeTab === 'github' ? "https://github.com/user/repo" : "Ex: como instalar docker"}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className={styles.input}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            />
            <button 
              className={styles.generateButton}
              onClick={handleGenerate}
              disabled={loading || !query.trim()}
            >
              {loading ? <Loader2 size={16} className={styles.spin} /> : (isCompact ? 'Go' : 'Generate Skill')}
            </button>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
