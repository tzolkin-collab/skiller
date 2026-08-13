import type { Metadata } from "next";
import { Roboto, Oswald, Syne, JetBrains_Mono } from "next/font/google";
import { FaviconAnimator } from "@/components/ui/FaviconAnimator/FaviconAnimator";
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

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Skiller | YouTube Playlist to Skills",
  description: "Transform any YouTube playlist into an actionable, structured SKILL.md document for AI coding assistants.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${oswald.variable} ${syne.variable} ${jetbrainsMono.variable}`}>
        <FaviconAnimator />
        {children}
      </body>
    </html>
  );
}
