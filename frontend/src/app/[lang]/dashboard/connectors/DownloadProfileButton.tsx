"use client";

import { useState } from 'react';
import { Download } from 'lucide-react';
import styles from '../page.module.css';

interface Props {
  text: string;
}

export function DownloadProfileButton({ text }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    
    // Determine the base URL dynamically based on where the user is
    const baseUrl = window.location.origin + '/api';

    const config = {
      mcpServers: {
        skiller: {
          command: "npx",
          args: ["-y", "@skiller/mcp-server", "start"],
          env: {
            SKILLER_API_URL: baseUrl
          }
        }
      }
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skiller-mcp-config.json';
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setTimeout(() => setDownloading(false), 500);
  };

  return (
    <button 
      onClick={handleDownload}
      disabled={downloading}
      className={styles.statusBadge + ' ' + styles.queued} 
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', border: 'none' }}
    >
      <Download size={14} />
      {text}
    </button>
  );
}
