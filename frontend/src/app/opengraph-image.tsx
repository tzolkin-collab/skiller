import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Skiller — YouTube Playlist to SKILL.md';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0c0c0c',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
          gap: '80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Ícone — sem animação, estático para og-image */}
        <svg width="200" height="200" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
          <path d="M16 12C16 8 20 6 20 2" stroke="#ff3333" strokeWidth="4" strokeLinecap="square" />
          <path d="M24 14C24 9 28 7 28 3" stroke="#ff3333" strokeWidth="4" strokeLinecap="square" />
          <path d="M32 12C32 8 36 6 36 2" stroke="#ff3333" strokeWidth="4" strokeLinecap="square" />
          <path
            d="M8 18H36V30C36 35.5 31.5 40 26 40H18C12.5 40 8 35.5 8 30V18Z"
            fill="rgba(255,51,51,0.12)"
            stroke="#ff3333"
            strokeWidth="4"
            strokeLinejoin="miter"
          />
          <path
            d="M36 22H40C42.2091 22 44 23.7909 44 26C44 28.2091 42.2091 30 40 30H36"
            stroke="#ff3333"
            strokeWidth="4"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>

        {/* Separador vertical */}
        <div
          style={{
            width: '2px',
            height: '200px',
            background: '#ff3333',
            opacity: 0.4,
            flexShrink: 0,
          }}
        />

        {/* Texto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              color: '#f0ede8',
              fontSize: '96px',
              fontWeight: 700,
              letterSpacing: '-4px',
              lineHeight: 1,
            }}
          >
            Skiller
          </div>
          <div
            style={{
              color: '#ff3333',
              fontSize: '28px',
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0px',
              opacity: 0.9,
            }}
          >
            YouTube Playlist → SKILL.md
          </div>
          <div
            style={{
              color: '#666',
              fontSize: '22px',
              marginTop: '8px',
              maxWidth: '500px',
              lineHeight: 1.5,
            }}
          >
            Transform any playlist into structured knowledge for AI coding assistants.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
