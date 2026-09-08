'use client';

/**
 * Liga as notificações do navegador para este aparelho.
 *
 * A inscrição é por DISPOSITIVO, não por conta: quem ligar no iPhone e quiser
 * também no notebook precisa ligar nos dois. Por isso o texto fala em "este
 * aparelho" e não em "sua conta".
 *
 * O caso do iPhone manda no desenho da tela. Lá o push só existe com o PWA
 * instalado na tela de início — em aba do Safari o pedido de permissão até
 * aparece, mas nada chega. Detectar isso ANTES de pedir permissão evita o pior
 * resultado possível: a pessoa concede, não recebe nada, e conclui que o
 * produto é quebrado. Permissão negada não se pede de novo pelo site.
 */
import { useEffect, useState } from 'react';
import { BellRing, BellOff, Smartphone, Loader2 } from 'lucide-react';
import { BASE_URL } from '@/lib/api-base';
import styles from './Settings.module.css';

/** A chave VAPID viaja em base64url; o `subscribe` quer bytes. */
function chaveParaBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(b64);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

type Estado = 'carregando' | 'sem-suporte' | 'precisa-instalar' | 'desligado' | 'ligado' | 'negado';

/**
 * `navigator.serviceWorker.ready` com prazo.
 *
 * Sem o prazo isto trava a tela: quando não há service worker ativo no escopo,
 * `ready` NÃO rejeita — ele simplesmente nunca resolve. `catch` e `try` não
 * pegam promessa pendurada, então o componente ficava em "Verificando…" para
 * sempre, sem erro nenhum no console.
 *
 * Devolve `null` no estouro em vez de lançar: quem chama decide o que fazer com
 * a ausência, e nenhum caminho fica esperando para sempre.
 */
async function swPronto(ms = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

export function PushToggle({ lang }: { lang: string }) {
  const pt = lang === 'pt';
  const [estado, setEstado] = useState<Estado>('carregando');
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (typeof window === 'undefined') return;

        const temAPI =
          'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

        // iOS: `standalone` só é true dentro do PWA instalado. Em aba, o
        // PushManager pode até existir e a inscrição falha depois.
        const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const instalado =
          (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
          window.matchMedia('(display-mode: standalone)').matches;

        if (!temAPI) return setEstado('sem-suporte');
        if (ehIOS && !instalado) return setEstado('precisa-instalar');
        if (Notification.permission === 'denied') return setEstado('negado');

        const reg = await swPronto();
        const inscricao = await reg?.pushManager.getSubscription().catch(() => null);
        setEstado(inscricao ? 'ligado' : 'desligado');
      } catch {
        // Qualquer tropeço aqui deixava a tela em "Verificando…" para sempre,
        // porque a promessa da IIFE rejeitava sem ninguém escutando. Cair para
        // "desligado" ao menos oferece o botão: o pior que acontece é o
        // Ativar falhar com uma mensagem, o que já diz mais que um spinner.
        setEstado('desligado');
      }
    })();
  }, []);

  async function ligar() {
    setOcupado(true);
    setRecado(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        setEstado(permissao === 'denied' ? 'negado' : 'desligado');
        return;
      }

      const resChave = await fetch(`${BASE_URL}/api/push/key`, { credentials: 'include' });
      if (!resChave.ok) throw new Error(pt ? 'Push não está configurado no servidor.' : 'Push is not configured.');
      const { key } = (await resChave.json()) as { key: string };

      // Registrar antes de esperar: se o script do layout não rodou, ou o
      // registro morreu, `ready` esperaria por um worker que nunca vem.
      await navigator.serviceWorker.register('/sw.js').catch(() => null);
      const reg = await swPronto(8000);
      if (!reg) {
        throw new Error(
          pt
            ? 'O service worker não ficou pronto. Feche e abra o app e tente de novo.'
            : 'Service worker not ready. Close and reopen the app, then try again.'
        );
      }

      const inscricao = await reg.pushManager.subscribe({
        // Obrigatório: todo push precisa virar notificação visível. Não dá
        // para usar isto como canal silencioso.
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(key) as BufferSource,
      });

      const res = await fetch(`${BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inscricao.toJSON()),
      });
      if (!res.ok) throw new Error(pt ? 'O servidor recusou a inscrição.' : 'Server refused the subscription.');

      setEstado('ligado');
      setRecado(pt ? 'Pronto. Toque em testar para confirmar.' : 'Done. Tap test to confirm.');
    } catch (e) {
      setRecado(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    setRecado(null);
    try {
      const reg = await swPronto();
      const inscricao = await reg?.pushManager.getSubscription();
      if (inscricao) {
        await fetch(`${BASE_URL}/api/push/unsubscribe`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        });
        await inscricao.unsubscribe();
      }
      setEstado('desligado');
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setOcupado(true);
    setRecado(null);
    try {
      const res = await fetch(`${BASE_URL}/api/push/test`, { method: 'POST', credentials: 'include' });
      const { entregues } = (await res.json()) as { entregues: number };
      setRecado(
        entregues > 0
          ? pt ? `Enviado para ${entregues} aparelho(s).` : `Sent to ${entregues} device(s).`
          : pt ? 'Nenhum aparelho recebeu — reative a permissão.' : 'No device received it.'
      );
    } finally {
      setOcupado(false);
    }
  }

  const textos: Record<Estado, string> = {
    carregando: pt ? 'Verificando…' : 'Checking…',
    'sem-suporte': pt
      ? 'Este navegador não suporta notificações push.'
      : 'This browser does not support push notifications.',
    'precisa-instalar': pt
      ? 'No iPhone, as notificações só funcionam com o Skiller instalado na tela de início. Toque em Compartilhar → Adicionar à Tela de Início, abra por lá e volte aqui.'
      : 'On iPhone, push only works with Skiller installed to the Home Screen. Tap Share → Add to Home Screen, open it from there and come back.',
    desligado: pt
      ? 'Receba um aviso quando o agente parar esperando você, ou quando uma skill ficar pronta.'
      : 'Get notified when the agent stops waiting for you, or a skill is ready.',
    ligado: pt ? 'Ligadas neste aparelho.' : 'Enabled on this device.',
    negado: pt
      ? 'Permissão negada. Reative nas configurações do navegador para este site — daqui não dá para pedir de novo.'
      : 'Permission denied. Re-enable it in the browser settings for this site.',
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          {estado === 'ligado' ? (
            <BellRing size={20} />
          ) : estado === 'precisa-instalar' ? (
            <Smartphone size={20} />
          ) : (
            <BellOff size={20} />
          )}
          <div>
            <h3 className={styles.cardTitle}>
              {pt ? 'Notificacoes neste aparelho' : 'Notifications on this device'}
            </h3>
            <p className={styles.cardDesc}>{textos[estado]}</p>
          </div>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.acoesInline}>
          {estado === 'desligado' && (
            <button onClick={ligar} disabled={ocupado} className={styles.botaoCompacto}>
              {ocupado && <Loader2 size={14} />}
              {pt ? 'Ativar' : 'Enable'}
            </button>
          )}
          {estado === 'ligado' && (
            <>
              <button onClick={testar} disabled={ocupado} className={styles.botaoCompacto}>
                {ocupado && <Loader2 size={14} />}
                {pt ? 'Testar' : 'Test'}
              </button>
              <button onClick={desligar} disabled={ocupado} className={styles.btnDiscreto}>
                {pt ? 'Desativar' : 'Disable'}
              </button>
            </>
          )}
        </div>

        {recado && <p className={styles.cardDesc} style={{ marginTop: '0.75rem' }}>{recado}</p>}
      </div>
    </div>
  );
}
