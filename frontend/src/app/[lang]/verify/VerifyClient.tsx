"use client";

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { useSession } from '@/lib/session';
import { BASE_URL } from '@/lib/api-base';
type DictionaryType = Record<string, unknown> & {
  verify?: Record<string, string>;
  common?: Record<string, string>;
};

export default function VerifyClient({ lang, dict }: { lang: string, dict: DictionaryType }) {
  // Qual conta esta autorizando. O backend passou a exigir isto explicitamente:
  // antes ele vinculava o dispositivo ao PRIMEIRO usuario da tabela, emitindo um
  // token de longa duracao para uma conta arbitraria.
  const { userId, pronto: sessaoPronta } = useSession();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 8) return;

    if (!userId) {
      setStatus('error');
      setMessage(
        lang === 'pt'
          ? 'Escolha uma conta no painel antes de autorizar o dispositivo.'
          : 'Pick an account in the dashboard before authorizing this device.'
      );
      return;
    }

    setStatus('loading');
    try {
      const baseUrl = BASE_URL;
      const res = await fetch(`${baseUrl}/api/oauth/device/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCode: code.toUpperCase(), userId })
      });
      
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage('Device authorized successfully! You can close this window and return to your terminal.');
      } else {
        setStatus('error');
        // `data.message` primeiro: `data.error` e o codigo interno
        // (`plan_required`, `user_required`), inutil para quem esta lendo.
        setMessage(data.message || data.error || 'Failed to authorize device.');
      }
    } catch (err) {
      setStatus('error');
      setMessage('Network error.');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Card style={{ maxWidth: '400px', width: '100%' }}>
        <CardHeader>
          <CardTitle style={{ textAlign: 'center' }}>Connect Device</CardTitle>
        </CardHeader>
        <CardContent>
          <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
            Enter the 8-character code displayed in your terminal to authorize the CLI.
          </p>
          
          <form onSubmit={handleVerify}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Input 
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-1234"
                maxLength={9}
                style={{ textAlign: 'center', letterSpacing: '0.2em', fontSize: '1.2rem', textTransform: 'uppercase' }}
              />
              
              <Button type="submit" disabled={status === 'loading' || code.length < 8 || !sessaoPronta} style={{ width: '100%' }}>
                {status === 'loading' ? 'Verifying...' : 'Authorize Device'}
              </Button>
            </div>
          </form>

          {status === 'success' && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--success-bg, rgba(0, 255, 0, 0.1))', color: 'var(--success-text, #4ade80)', borderRadius: '4px', textAlign: 'center' }}>
              {message}
            </div>
          )}
          {status === 'error' && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--error-bg, rgba(255, 0, 0, 0.1))', color: 'var(--error-text, #ef4444)', borderRadius: '4px', textAlign: 'center' }}>
              {message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
