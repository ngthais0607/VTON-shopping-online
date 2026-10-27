import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Sidebar } from '@/components/sidebar'
import './globals.css'
import { LayoutClientWrapper } from '@/components/layout-client-wrapper'

export const metadata: Metadata = {
  title: {
    default: 'TrueLook | Premium E-Commerce',
    template: '%s | TrueLook'
  },
  description: 'TrueLook - Trải nghiệm mua sắm trực tuyến cao cấp',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">
        <LayoutClientWrapper>
          {children}
        </LayoutClientWrapper>
        {process.env.NODE_ENV === 'production' && process.env.VERCEL === '1' && <Analytics />}
      </body>
    </html>
  );
}
