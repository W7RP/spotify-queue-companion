import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Queue Companion",
  description: "Choose what plays next. Add songs to your Spotify queue, then keep listening.",
  manifest: '/manifest.webmanifest?v=2',
  appleWebApp: { capable: true, title: 'Queue Companion', statusBarStyle: 'black' },
  icons: {
    icon: [{ url: '/favicon.png?v=2', type: 'image/png', sizes: '64x64' }],
    shortcut: '/favicon.ico?v=2',
    apple: [{ url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
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
