'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input/Input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card/Card';
import { PlaySquare, FileCode2, Clock } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import type { Dictionary } from '@/types/dictionary';
import type { SkillSummary } from '@/types/api';
import styles from '../page.module.css';

interface LibraryClientProps {
  dict: Dictionary;
  lang: string;
}

export default function LibraryClient({ dict, lang }: LibraryClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const { data: skills, error: fetchError } = useSWR<SkillSummary[]>(`${apiUrl}/api/skills`, fetcher, {
    refreshInterval: 10000,
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{dict.dashboard.libraryTitle}</h1>
        <p className={styles.subtitle}>{dict.dashboard.librarySubtitle}</p>
      </header>

      {/* SEARCH BAR */}
      <div className={styles.searchSection}>
        <Input 
          placeholder={dict.dashboard.searchSkills}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Skills Library */}
      <div className={styles.librarySection}>
        {fetchError && <p className={styles.fetchError}>{dict.dashboard.fetchError}</p>}
        {!skills && !fetchError && <p className={styles.loading}>{dict.dashboard.loading}</p>}
        
        {skills && skills.length === 0 && (
          <div className={styles.emptyState}>
            <FileCode2 size={48} className={styles.emptyIcon} />
            <h3>{dict.dashboard.emptyTitle}</h3>
            <p>{dict.dashboard.emptyDesc}</p>
          </div>
        )}

        {skills && skills.length > 0 && (
          <div className={styles.grid}>
            {skills
              .filter((skill) =>
                (skill.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (skill.description || '').toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((skill) => (
              <Card 
                key={skill.id} 
                className={styles.skillCard} 
                onClick={() => router.push(`/${lang}/dashboard/skills/${skill.id}`)}
              >
                <CardHeader>
                  <CardTitle className={styles.skillTitle}>
                    <PlaySquare size={18} className={styles.titleIcon} />
                    {skill.name || dict.dashboard.processingSkill}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={styles.skillDesc}>{skill.description || dict.dashboard.extractingData}</p>
                  <div className={styles.skillMeta}>
                    <span className={styles.statusBadge + ' ' + styles[skill.status]}>
                      {skill.status}
                    </span>
                    <span className={styles.date}>
                      <Clock size={14} />
                      {new Date(skill.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
