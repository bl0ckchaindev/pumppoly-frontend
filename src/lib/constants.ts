import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import Web3 from 'web3'

export const publicClient = createPublicClient({
    chain: base,
    transport: http()
})


// Support both REACT_APP_ and NEXT_PUBLIC_ for migration compatibility
const getEnvVar = (key: string, defaultValue: string) => {
  return process.env[`NEXT_PUBLIC_${key}`] || process.env[`REACT_APP_${key}`] || defaultValue
}

const PROVIDER_URL_BASE = getEnvVar('BASE_RPC_URL', 'https://mainnet.base.org')
// Use Infura as fallback for Sepolia (more reliable than publicnode)
const PROVIDER_URL_SEPOLIA = getEnvVar('SEPOLIA_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com')

export const baseWeb3Client = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL_BASE))
export const web3ClientSepolia = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL_SEPOLIA))

export const web3Clients = {
    8453: baseWeb3Client,
    11155111: web3ClientSepolia
}

export const imageUrl = getEnvVar('IMAGE_URL', 'https://api.trollspump.fun/uploads/')

export const apiUrl = getEnvVar('API_URL', 'https://api.trollspump.fun')

export const imageUploadUrl = getEnvVar('IMAGE_UPLOAD_URL', 'https://api.trollspump.fun/uploads/')

export const ethPriceApiUrl = {
 8453: 'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD',
 11155111: 'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD',
}

export const solPriceApiUrl = 'https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD'

// Solana RPC URL
export const SOLANA_RPC_URL = getEnvVar('SOLANA_RPC_URL', 'https://devnet.helius-rpc.com/?api-key=6e63ee0b-5f90-48a5-be38-cc91bfe10efd')

// Solana Program ID
export const SOLANA_PROGRAM_ID = 'H9puYYy1pzfz4munVYoNTWWLAoeAP78Atfq6EKbTmKKf'

// Get chain ID from environment variable, default to Base (8453)
export const CHAIN_ID = (process.env.NEXT_PUBLIC_CHAIN_ID || process.env.REACT_APP_CHAIN_ID)
    ? Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.REACT_APP_CHAIN_ID) 
    : 11155111 // Default to Sepolia

export const supportedChainIds = [8453, 11155111] // Base and Sepolia
export const SOLANA_CHAIN = 'solana' // Solana chain identifier

export const chainLogos = {
    8453: '/base.svg',
    11155111: '/eth.svg',
    solana: '/polygon.svg', // Using polygon icon as placeholder, replace with Solana icon
}

export const feeAmounts = {
    8453: 0.0012,
    11155111: 0.001,
}

export const initialEth = {
    8453: 2.07,
    11155111: 0.01,
}

export const coinNames = {
    8453: 'ETH',
    11155111: 'ETH',
    solana: 'SOL'
}

// Solana bonding curve completion threshold (SOL). Single source of truth for progress display.
// Override via NEXT_PUBLIC_SOLANA_BONDING_LIMIT_SOL or REACT_APP_SOLANA_BONDING_LIMIT_SOL (e.g. 85).
export const SOLANA_BONDING_LIMIT_SOL = 85

export const bondingLimits: Record<number | string, number> = {
    8453: 10,
    11155111: 2,
    solana: SOLANA_BONDING_LIMIT_SOL  // SOL amount for Solana bonding curve completion (real_sol_threshold)
}

export const scanLinks = {
    8453: 'https://basescan.org/',
    11155111: 'https://sepolia.etherscan.io/',
    solana: 'https://solscan.io/'
}

export const scanApiLinks = {
    8453: 'https://api.basescan.org/api',
    11155111: 'https://api-sepolia.etherscan.io/api'
}

export const apiKeys = {
    // Add API keys here if needed for Base or Sepolia
}

export const chainNames = {
    8453: 'base',
    11155111: 'sepolia',
    solana: 'solana'
}

export const chainNames1 = {
    8453: 'base',
    11155111: 'sepolia'
}

// Total supply for newly created tokens (1 billion = 1000000000)
// Can be overridden via NEXT_PUBLIC_TOKEN_TOTAL_SUPPLY or REACT_APP_TOKEN_TOTAL_SUPPLY environment variable
export const TOKEN_TOTAL_SUPPLY = (process.env.NEXT_PUBLIC_TOKEN_TOTAL_SUPPLY || process.env.REACT_APP_TOKEN_TOTAL_SUPPLY)
    ? Number(process.env.NEXT_PUBLIC_TOKEN_TOTAL_SUPPLY || process.env.REACT_APP_TOKEN_TOTAL_SUPPLY) 
    : 1000000000

// Check if Supabase is configured (supports both NEXT_PUBLIC_ and REACT_APP_ prefixes for migration)
export const useSupabase = !!(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL) &&
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY)
)

export default function formatNumber(number: number): string {
    if (number >= 1000000) {
        return (number / 1000000).toLocaleString() + 'M';
    } else if (number >= 1000) {
        return (number / 1000).toLocaleString() + 'K';
    } else {
        return number.toString();
    }
}