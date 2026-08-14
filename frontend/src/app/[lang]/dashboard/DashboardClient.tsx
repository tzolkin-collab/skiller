'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Card, CardContent } from '@/components/ui/Card/Card';
import { AlertCircle } from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import type { Dictionary } from '@/types/dictionary';
import styles from './page.module.css';

interface DashboardClientProps {
  dict: Dictionary;
  lang: string;
}

export default function DashboardClient({ dict, lang }: DashboardClientProps) {
  const [url, setUrl] = useState('');
  const [targetFormat, setTargetFormat] = useState('gemini');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isPlaylist = url.includes('youtube.com/playlist?list=');
    const isVideo = url.includes('youtube.com/watch?v=') || url.includes('youtu.be/');
    if (!isPlaylist && !isVideo) {
      setError(dict.dashboard.errorInvalidUrl);
      return;
    }
    
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ playlistUrl: url, targetFormat, language: lang })
      });

      if (!res.ok) {
        throw new Error(dict.dashboard.errorFailed);
      }

      const { id } = await res.json();
      router.push(`/${lang}/dashboard/skills/${id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, dict.dashboard.errorFailed));
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{dict.dashboard.generateTitle}</h1>
        <p className={styles.subtitle}>{dict.dashboard.generateSubtitle}</p>
      </header>

      {/* Generation Form */}
      <Card className={styles.formCard}>
        <CardContent>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <Input 
                placeholder={dict.dashboard.inputPlaceholder} 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isSubmitting}
                className={styles.input}
              />
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value)}
                disabled={isSubmitting}
                className={styles.formatSelect}
              >
                <option value="gemini">{dict.dashboard.formatGemini}</option>
                <option value="claude">{dict.dashboard.formatClaude}</option>
                <option value="copilot">{dict.dashboard.formatCopilot}</option>
                <option value="mcp">{dict.dashboard.formatMcp}</option>
                <option value="generic">{dict.dashboard.formatGeneric}</option>
              </select>
              <Button type="submit" disabled={isSubmitting || !url}>
                {isSubmitting ? dict.dashboard.btnStarting : dict.dashboard.btnGenerate}
              </Button>
            </div>
            {error && (
              <div className={styles.error}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
