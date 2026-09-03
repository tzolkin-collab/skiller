import type { Metadata } from "next";
import { Roboto, Oswald, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  weight: ['400', '500', '700', '900'],
  subsets: ["latin"],
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
});

/**
 * Display corporativa.
 *
 * Era Syne — geométrica, larga e com formas excêntricas. Numa landing isso
 * passa por personalidade; num card de plano com preço, passa por
 * desalinhado. IBM Plex Sans forma par com a Plex Mono usada em dado
 * tabular, então título e número passam a vir da mesma família.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-display",
  weight: ['400', '500', '600', '700'],
  subsets: ["latin"],
});

/**
 * Monoespaçada corporativa.
 *
 * Era JetBrains Mono, que é fonte de IDE: ligaduras de código e desenho com
 * personalidade de editor. Aqui ela aparece em id de sessão, token mascarado,
 * valor de plano — dado tabular de produto, não código. IBM Plex Mono foi
 * desenhada como face corporativa e resolve o mesmo problema sem o sotaque.
 */
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-corp",
  weight: ['400', '500', '600'],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Skiller | YouTube Playlist to Skills",
  description: "Transform any YouTube playlist into an actionable, structured SKILL.md document for AI coding assistants.",
  // icon.tsx e opengraph-image.tsx na pasta app/ são detectados automaticamente
  // pelo App Router — não precisam ser declarados aqui. O SVG animado fica como
  // fallback para browsers que suportam SVG favicon.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Skiller | YouTube Playlist to Skills",
    description: "Transform any YouTube playlist into an actionable, structured SKILL.md document for AI coding assistants.",
    siteName: "Skiller",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Skiller | YouTube Playlist to Skills",
    description: "Transform any YouTube playlist into an actionable, structured SKILL.md document for AI coding assistants.",
  },
};

import { CartProvider } from "@/components/providers/CartProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${oswald.variable} ${plexSans.variable} ${plexMono.variable}`}>
        <CartProvider>
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
