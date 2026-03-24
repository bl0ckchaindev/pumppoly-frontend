import { cookieStorage, createStorage } from '@wagmi/core'
import { http } from 'viem'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { base as baseChain, sepolia as sepoliaChain } from 'wagmi/chains'

// Get projectId from https://dashboard.reown.com
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || 'c04699b6303dc64324e7efde80f72bd6'

if (!projectId) {
  throw new Error('Project ID is not defined. Please set NEXT_PUBLIC_PROJECT_ID environment variable.')
}

// Custom RPC URLs to avoid WalletConnect rate limits (429) and CORS issues
const getEnvVar = (key, defaultValue) =>
  (typeof process !== 'undefined' && process.env?.[`NEXT_PUBLIC_${key}`]) ||
  (typeof process !== 'undefined' && process.env?.[`REACT_APP_${key}`]) ||
  defaultValue

const BASE_RPC_URL = getEnvVar('BASE_RPC_URL', 'https://mainnet.base.org')
const SEPOLIA_RPC_URL = getEnvVar('SEPOLIA_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com')

// Define networks in Reown AppKit format
// Convert wagmi chains to AppKit network format
const baseNetwork = {
  id: baseChain.id,
  name: baseChain.name,
  network: baseChain.network,
  nativeCurrency: baseChain.nativeCurrency,
  rpcUrls: {
    default: {
      http: [BASE_RPC_URL, ...(baseChain.rpcUrls.default.http || [])],
    },
  },
  blockExplorers: baseChain.blockExplorers,
}

const sepoliaNetwork = {
  id: sepoliaChain.id,
  name: sepoliaChain.name,
  network: sepoliaChain.network,
  nativeCurrency: sepoliaChain.nativeCurrency,
  rpcUrls: {
    default: {
      http: [SEPOLIA_RPC_URL, ...(sepoliaChain.rpcUrls.default.http || [])],
    },
  },
  blockExplorers: sepoliaChain.blockExplorers,
}

// Networks for Reown AppKit
export const networks = [baseNetwork, sepoliaNetwork]

// Custom transports: use our RPC URLs first to avoid WalletConnect 429/CORS
const transports = {
  [baseChain.id]: http(BASE_RPC_URL),
  [sepoliaChain.id]: http(SEPOLIA_RPC_URL),
}

// Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage
  }),
  ssr: true,
  projectId,
  networks,
  transports,
})

export const config = wagmiAdapter.wagmiConfig