import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Skiller',
    short_name: 'Skiller',
    description: 'Transform YouTube playlists and docs into AI skills.',
    start_url: '/pt/dashboard',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#0a0a0f',
    orientation: 'portrait-primary',
    categories: ['productivity', 'education'],
    icons: [
      {
        src: '/skiller-google-logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/skiller-logo-transparent.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [],
  };
}
