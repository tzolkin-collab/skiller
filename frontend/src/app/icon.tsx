import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Favicon PNG — fallback para contextos que não aceitam SVG (Vercel, Windows Chrome)
export default function Icon() {
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
        }}
      >
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <path
            d="M8 18H36V30C36 35.5 31.5 40 26 40H18C12.5 40 8 35.5 8 30V18Z"
            fill="rgba(255,51,51,0.15)"
            stroke="#ff3333"
            strokeWidth="5"
            strokeLinejoin="miter"
          />
          <path
            d="M36 22H40C42.2091 22 44 23.7909 44 26C44 28.2091 42.2091 30 40 30H36"
            stroke="#ff3333"
            strokeWidth="5"
            strokeLinecap="square"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
