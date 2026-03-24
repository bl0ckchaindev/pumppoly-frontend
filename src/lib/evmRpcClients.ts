/**
 * Viem PublicClients that use our custom RPC URLs.
 * Use these for readContract and other read operations to avoid WalletConnect's
 * rate-limited RPC (429) and CORS issues.
 */

import { createPublicClient, http, type PublicClient } from 'viem'
import { base, sepolia } from 'viem/chains'

const getEnvVar = (key: string, defaultValue: string) =>
  (typeof process !== 'undefined' && process.env?.[`NEXT_PUBLIC_${key}`]) ||
  (typeof process !== 'undefined' && process.env?.[`REACT_APP_${key}`]) ||
  defaultValue

// Use env RPC URLs; defaults: official public endpoints (override via NEXT_PUBLIC_SEPOLIA_RPC_URL etc. for higher limits)
const BASE_RPC_URL = getEnvVar('BASE_RPC_URL', 'https://mainnet.base.org')
const SEPOLIA_RPC_URL = getEnvVar('SEPOLIA_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com')

const baseClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
})

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
})

const clients: Record<number, PublicClient> = {
  [base.id]: baseClient as PublicClient,
  [sepolia.id]: sepoliaClient as PublicClient,
}

/** Get a public client for the given chainId. Uses our custom RPC, not WalletConnect. */
export function getEvmPublicClient(chainId: number): PublicClient {
  return clients[chainId] ?? sepoliaClient
}
