import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100svh', gap: '1rem', fontFamily: 'sans-serif', color: '#ccc', background: '#0a0a0f' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
      </svg>
      <p style={{ margin: 0, fontSize: '1rem' }}>Sem conexão com a internet.</p>
      <Link href="/" style={{ color: '#6366f1', fontSize: '0.875rem' }}>Tentar novamente</Link>
    </div>
  );
}
