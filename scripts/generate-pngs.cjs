const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const svgIconDark = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="110" fill="#0f0f0f"/>
  <rect x="2" y="2" width="508" height="508" rx="108" stroke="#262626" stroke-width="4"/>
  <g transform="translate(64, 64) scale(8.0)">
    <path d="M16 12C16 8 20 6 20 2" stroke="#ff3333" stroke-width="3.5" stroke-linecap="square" />
    <path d="M24 14C24 9 28 7 28 3" stroke="#ff3333" stroke-width="3.5" stroke-linecap="square" />
    <path d="M32 12C32 8 36 6 36 2" stroke="#ff3333" stroke-width="3.5" stroke-linecap="square" />
    <path d="M8 18H36V30C36 35.5 31.5 40 26 40H18C12.5 40 8 35.5 8 30V18Z" fill="#ff3333" fill-opacity="0.18" stroke="#ff3333" stroke-width="3.5" stroke-linejoin="miter" />
    <path d="M36 22H40C42.2091 22 44 23.7909 44 26C44 28.2091 42.2091 30 40 30H36" stroke="#ff3333" stroke-width="3.5" stroke-linecap="square" stroke-linejoin="miter" />
  </g>
</svg>`;

const svgTransparent = `<svg width="512" height="512" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 12C16 8 20 6 20 2" stroke="#ff3333" stroke-width="3.5" stroke-linecap="square" />
  <path d="M24 14C24 9 28 7 28 3" stroke="#ff3333" stroke-width="3.5" stroke-linecap="square" />
  <path d="M32 12C32 8 36 6 36 2" stroke="#ff3333" stroke-width="3.5" stroke-linecap="square" />
  <path d="M8 18H36V30C36 35.5 31.5 40 26 40H18C12.5 40 8 35.5 8 30V18Z" fill="#ff3333" fill-opacity="0.18" stroke="#ff3333" stroke-width="3.5" stroke-linejoin="miter" />
  <path d="M36 22H40C42.2091 22 44 23.7909 44 26C44 28.2091 42.2091 30 40 30H36" stroke="#ff3333" stroke-width="3.5" stroke-linecap="square" stroke-linejoin="miter" />
</svg>`;

const r1 = new Resvg(svgIconDark, { fitTo: { mode: 'width', value: 512 } });
fs.writeFileSync(path.join(__dirname, '../frontend/public/skiller-google-logo.png'), r1.render().asPng());

const r2 = new Resvg(svgTransparent, { fitTo: { mode: 'width', value: 512 } });
fs.writeFileSync(path.join(__dirname, '../frontend/public/skiller-logo-transparent.png'), r2.render().asPng());

console.log('PNGs gerados com sucesso em frontend/public/');
