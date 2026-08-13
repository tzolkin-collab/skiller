'use client';

import { useEffect } from 'react';

// Animated SVG representing the Skiller Logo
const animatedSvg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes draw {
      from { stroke-dashoffset: 150; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes smoke {
      0%, 100% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(1.2); opacity: 0.2; }
    }
    path {
      stroke-dasharray: 150;
      stroke-dashoffset: 150;
      animation: draw 0.8s ease-out forwards;
    }
    .smoke1 { animation: draw 0.8s ease-out 0.1s forwards, smoke 2s infinite ease-in-out; transform-origin: 18px 7px; }
    .smoke2 { animation: draw 0.8s ease-out 0.2s forwards, smoke 2s infinite ease-in-out; transform-origin: 26px 8.5px; }
    .smoke3 { animation: draw 0.8s ease-out 0.3s forwards, smoke 2s infinite ease-in-out; transform-origin: 34px 7px; }
    .cup { animation-delay: 0s; }
    .handle { animation-delay: 0.05s; }
  </style>
  <path class="smoke1" d="M16 12C16 8 20 6 20 2" stroke="#ff3333" stroke-width="4" stroke-linecap="square" />
  <path class="smoke2" d="M24 14C24 9 28 7 28 3" stroke="#ff3333" stroke-width="4" stroke-linecap="square" />
  <path class="smoke3" d="M32 12C32 8 36 6 36 2" stroke="#ff3333" stroke-width="4" stroke-linecap="square" />
  <path class="cup" d="M8 18H36V30C36 35.5 31.5 40 26 40H18C12.5 40 8 35.5 8 30V18Z" fill="#ff3333" fill-opacity="0.1" stroke="#ff3333" stroke-width="4" stroke-linejoin="miter" />
  <path class="handle" d="M36 22H42C44.2 22 46 23.8 46 26V28C46 30.2 44.2 32 42 32H35" stroke="#ff3333" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter" />
</svg>`;

const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(animatedSvg)}`;

export function FaviconAnimator() {
  useEffect(() => {
    const updateFavicon = () => {
      // Only animate if the tab is visible to avoid unnecessary DOM thrashing
      if (document.visibilityState === 'visible') {
        const existingLinks = document.querySelectorAll("link[rel~='icon']");
        
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.type = 'image/svg+xml';
        // Append a timestamp hash to force the browser to restart the SVG animation
        newLink.href = svgDataUri + '#t=' + Date.now();
        
        document.head.appendChild(newLink);
        
        // Remove old links after adding the new one to prevent favicon flicker
        existingLinks.forEach(link => {
          document.head.removeChild(link);
        });
      }
    };

    // Run once on mount
    updateFavicon();

    // Run every time the tab becomes visible
    document.addEventListener('visibilitychange', updateFavicon);
    
    return () => {
      document.removeEventListener('visibilitychange', updateFavicon);
    };
  }, []);

  return null;
}
