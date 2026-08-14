import React from 'react';
import { getDictionary } from '@/dictionaries';
import { SettingsContent } from '@/components/features/Settings/SettingsContent';

export default async function SettingsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <div style={{ padding: '2rem 0' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
        {dict.settings.title}
      </h1>
      <SettingsContent dict={dict} />
    </div>
  );
}
