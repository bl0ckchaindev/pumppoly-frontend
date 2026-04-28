import TokenPageClient from './TokenPageClient'

export function generateStaticParams() {
  return [{ tokenAddress: '_' }]
}

export default function Page() {
  return <TokenPageClient />
}
