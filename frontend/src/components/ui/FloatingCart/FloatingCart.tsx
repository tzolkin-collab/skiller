import React, { useState } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { useRouter } from 'next/navigation';
import styles from './FloatingCart.module.css';
import { Button } from '@/components/ui/Button/Button';

export function FloatingCart({ language = 'en' }: { language?: string }) {
  const { selectedUrls, clearCart } = useCart();
  const [format, setFormat] = useState('generic');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (selectedUrls.length === 0) return null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: selectedUrls,
          targetFormat: format,
          language: language
        })
      });

      if (!res.ok) {
        throw new Error('Failed to submit job');
      }

      clearCart();
      router.push(`/${language}/dashboard`);
      // Optional: show a toast notification here
    } catch (err) {
      console.error(err);
      alert('Error creating composite skill. Check console.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.cartContainer}>
      <div className={styles.cartContent}>
        <div className={styles.info}>
          <span className={styles.count}>{selectedUrls.length}</span>
          <span className={styles.label}>Items Selected</span>
        </div>
        
        <div className={styles.actions}>
          <select 
            value={format} 
            onChange={e => setFormat(e.target.value)}
            className={styles.formatSelect}
          >
            <option value="generic">Generic Markdown</option>
            <option value="gemini">Google Gemini System Prompt</option>
            <option value="claude">Anthropic Claude Project</option>
            <option value="copilot">GitHub Copilot Custom Instruction</option>
            <option value="mcp">MCP Server (Cline / Windsurf)</option>
          </select>
          
          <Button variant="ghost" onClick={clearCart}>
            Clear
          </Button>

          <Button 
            variant="primary" 
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Skill'}
          </Button>
        </div>
      </div>
    </div>
  );
}
