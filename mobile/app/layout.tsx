import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Queue Companion",
  description: "Choose what plays next. Add songs to your Spotify queue, then keep listening.",
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Queue Companion', statusBarStyle: 'black' },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: '/apple-touch-icon.png',
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#121212' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
