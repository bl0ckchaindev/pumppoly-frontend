import type { Metadata } from 'next'
import Providers from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'PumpPoly | Base Network Meme Coin Launchpad',
  description: 'PumpPoly | Base Network Meme Coin Launchpad',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Dela+Gothic+One&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers cookies={null}>{children}</Providers>
      </body>
    </html>
  )
}
