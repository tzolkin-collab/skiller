import React from 'react';
import { getDictionary } from '@/dictionaries';
import { SettingsContent } from '@/components/features/Settings/SettingsContent';
import styles from './page.module.css';

export default async function SettingsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <h1 className={styles.titulo}>{dict.settings.title}</h1>
        <p className={styles.subtitulo}>
          {lang === 'pt'
            ? 'Conta, assinatura, preferências e os dispositivos conectados ao seu Skiller.'
            : 'Account, subscription, preferences and the devices connected to your Skiller.'}
        </p>
      </header>
      <SettingsContent dict={dict} />
    </div>
  );
}
