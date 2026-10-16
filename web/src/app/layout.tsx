import type { Metadata, Viewport } from 'next';
import './globals.css';
const title = 'Branch Studio — Behavior Tree Editor';
const description =
  'Build behavior trees visually and generate typed C# for game AI and .NET workflows.';
const previewAlt =
  'Branch Studio showing a visual game AI behavior tree and its generated C# code.';
export const metadata: Metadata = {
  metadataBase: new URL('https://branch-studio.vercel.app'),
  title,
  description,
  applicationName: 'Branch Studio',
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Branch Studio',
    locale: 'en_US',
    title,
    description,
    images: [
      { url: '/social-preview.png', width: 1200, height: 630, type: 'image/png', alt: previewAlt },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [{ url: '/social-preview.png', alt: previewAlt }],
  },
};
export const viewport: Viewport = { themeColor: '#1b1e20', colorScheme: 'dark' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
