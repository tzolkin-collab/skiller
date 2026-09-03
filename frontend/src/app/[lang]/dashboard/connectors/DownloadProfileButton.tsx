"use client";

import { useState } from 'react';
import { Download } from 'lucide-react';
import styles from '../page.module.css';

interface Props {
  text: string;
  /** Endpoint MCP, resolvido do ambiente por quem renderiza. */
  mcpUrl: string;
}

export function DownloadProfileButton({ text, mcpUrl }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);

    /**
     * O perfil descrevia o binário local `@skiller/mcp-server`, que não lê
     * argumento nenhum — `start` era ignorado e o processo morria no boot.
     * E montava `SKILLER_API_URL` com `window.location.origin`, que é a origem
     * do FRONTEND: em produção o perfil apontava para o Next, não para a API.
     * Duas falhas somadas davam um arquivo que nunca conectou.
     *
     * Agora é o endpoint remoto, recebido de quem sabe ler o ambiente.
     */
    const config = {
      mcpServers: {
        skiller: { url: mcpUrl }
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
