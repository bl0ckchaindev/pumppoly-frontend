/**
 * Utility functions for token price and market calculations
 */

import { TOKEN_TOTAL_SUPPLY } from './constants'

/**
 * Calculate token price in USD
 * @param tokenPrice - Token price in wei format (10^15)
 * @param ethPrice - ETH price in USD
 * @returns Token price in USD
 */
export const calculateTokenPriceUSD = (tokenPrice: number, ethPrice: number): string => {
  if (!tokenPrice || !ethPrice) return '0.000000'
  const raw = (tokenPrice * ethPrice) / 10 ** 15
  return raw < 1e-10 ? raw.toFixed(12) : raw.toFixed(10)
}

/**
 * Calculate market cap
 * @param tokenPrice - Token price in wei format (10^15)
 * @param ethPrice - ETH price in USD
 * @returns Market cap in USD
 */
export const calculateMarketCap = (tokenPrice: number, ethPrice: number): number => {
  if (!tokenPrice || !ethPrice) return 0
  return (tokenPrice * TOKEN_TOTAL_SUPPLY * ethPrice) / (10 ** 15)
}

/**
 * Solana: token price from DB is "lamports (6-decimal token base units) per 1 SOL".
 * So SOL per token = 1 SOL / (tokenPriceFromDB in token terms) = 1e9 / tokenPriceFromDB.
 * Token price in USD = (1e9 / tokenPriceFromDB) * solPrice = (1e9 * solPrice) / tokenPriceFromDB.
 */
const LAMPORTS_PER_SOL = 1e9

/**
 * Calculate Solana token price in USD
 * @param tokenPriceFromDB - From DB: lamports (6 decimals) per 1 SOL (how many token base units per 1 SOL)
 * @param solPrice - SOL price in USD
 * @returns Token price in USD
 */
export const calculateSolanaTokenPriceUSD = (tokenPriceFromDB: number, solPrice: number): string => {
  if (!tokenPriceFromDB || !solPrice) return '0.000000'
  const raw = (solPrice) / tokenPriceFromDB
  return raw < 1e-10 ? raw.toFixed(12) : raw.toFixed(10)
}

/**
 * Calculate Solana token market cap in USD
 */
export const calculateSolanaMarketCap = (tokenPriceFromDB: number, solPrice: number): number => {
  if (!tokenPriceFromDB || !solPrice) return 0
  return (solPrice * TOKEN_TOTAL_SUPPLY) / tokenPriceFromDB
}

/**
 * Calculate Solana volume in USD (volume stored in lamports)
 * @param volumeLamports - Volume in lamports (1 SOL = 10^9 lamports)
 * @param solPrice - SOL price in USD
 */
export const calculateSolanaVolumeUSD = (volumeLamports: number, solPrice: number): number => {
  if (!volumeLamports || !solPrice) return 0
  return (volumeLamports * solPrice) / (10 ** 9)
}

/**
 * Calculate volume in USD
 * @param volume - Volume in wei (10^18)
 * @param ethPrice - ETH price in USD
 * @returns Volume in USD
 */
export const calculateVolumeUSD = (volume: number, ethPrice: number): number => {
  if (!volume || !ethPrice) return 0
  return (volume * ethPrice) / (10 ** 18)
}

/**
 * Calculate bonding curve progress
 * @param virtualEthLp - Virtual ETH LP in wei
 * @param initialEth - Initial ETH amount
 * @param bondingLimit - Bonding limit
 * @param lpCreated - Whether LP is created
 * @returns Progress percentage (0-100)
 */
export const calculateProgress = (
  virtualEthLp: number,
  initialEth: number,
  bondingLimit: number,
  lpCreated: boolean
): number => {
  if (lpCreated) return 100
  const realEth = virtualEthLp / 10 ** 18 - initialEth
  if (realEth < 0) return 0
  return Math.min((realEth / bondingLimit) * 100, 100)
}

/**
 * Format large numbers with K/M suffixes
 */
export const formatNumber = (num: number, decimals: number = 0): string => {
  if (num >= 1000000) {
    return (num / 1000000).toLocaleString(undefined, { maximumFractionDigits: decimals }) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toLocaleString(undefined, { maximumFractionDigits: decimals }) + 'K'
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

/**
 * Format token age
 */
export const formatTokenAge = (ageInSeconds: number): string => {
  if (!ageInSeconds) return 'Loading...'
  const days = Math.floor(ageInSeconds / 86400)
  const hours = Math.floor((ageInSeconds % 86400) / 3600)
  const minutes = Math.floor((ageInSeconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes}m`
  }
}

/**
 * Format address for display
 */
export const formatAddress = (address: string, start: number = 6, end: number = 4): string => {
  if (!address) return ''
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

/**
 * Format token price for UI display.
 * - If sub-decimal zeros are fewer than 3 (e.g. 0.01, 0.001): show value directly.
 * - If 4 or more leading zeros after decimal (e.g. 0.00005): show as 0.0(n)x (e.g. 0.0(4)5).
 */
export const formatTokenPriceDisplay = (price: number | string): string => {
  const num = typeof price === 'string' ? parseFloat(price) : Number(price)
  if (!Number.isFinite(num) || num < 0) return '0.0000'
  if (num === 0) return '0.0000'

  if (num >= 0.001) {
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  }

  if (num < 0.0001) {
    if (num < 1e-20) return '0.0000'
    const exp = Math.floor(Math.log10(num))
    const n = -exp - 1
    const mantissa = num / Math.pow(10, exp)
    // ✅ Round mantissa to 2 significant digits
    const roundedMantissa = parseFloat(mantissa.toPrecision(2))
    const sig = roundedMantissa.toString().replace('.', '')
    return `0.0(${n})${sig || '0'}`
  }

  return num.toFixed(4)
}

