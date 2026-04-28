import type { Metadata } from 'next'
import { Bricolage_Grotesque, Dela_Gothic_One } from 'next/font/google'
import Providers from './providers'
import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
})

const delaGothic = Dela_Gothic_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dela-gothic',
  display: 'swap',
})

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
    <html
      lang="en"
      className={`${bricolage.variable} ${delaGothic.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers cookies={null}>{children}</Providers>
      </body>
    </html>
  )
}
