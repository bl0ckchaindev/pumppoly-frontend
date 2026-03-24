/**
 * In-memory cache for Solana program reads to reduce RPC calls.
 * Only caches read-only data (GlobalConfig, BondingCurve). Invalidated on write (e.g. after swap).
 */

export interface BondingCurveCacheData {
  owner: string
  openTime: number
  realBaseReserves: number
  virtualBaseReserves: number
  realQuoteReserves: number
  virtualQuoteReserves: number
  totalSupply: number
  complete: boolean
}

const GLOBAL_CONFIG_TTL_MS = 60 * 1000  // 1 min – protocol config rarely changes
const BONDING_CURVE_TTL_MS = 500       // 100 ms – balance/progress can change after trades

let globalConfigCache: { valueSol: number; ts: number } | null = null
const bondingCurveCache = new Map<string, { value: BondingCurveCacheData; ts: number }>()

export function getCachedGlobalConfig(): number | null {
  if (!globalConfigCache) return null
  if (Date.now() - globalConfigCache.ts > GLOBAL_CONFIG_TTL_MS) {
    globalConfigCache = null
    return null
  }
  return globalConfigCache.valueSol
}

export function setCachedGlobalConfig(valueSol: number): void {
  globalConfigCache = { valueSol, ts: Date.now() }
}

export function getCachedBondingCurve(tokenAddress: string): BondingCurveCacheData | null {
  const key = tokenAddress
  const entry = bondingCurveCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > BONDING_CURVE_TTL_MS) {
    bondingCurveCache.delete(key)
    return null
  }
  return entry.value
}

export function setCachedBondingCurve(tokenAddress: string, data: BondingCurveCacheData): void {
  bondingCurveCache.set(tokenAddress, { value: data, ts: Date.now() })
}

/** Call after user buy/sell so next read gets fresh chain data. */
export function invalidateBondingCurve(tokenAddress: string): void {
  bondingCurveCache.delete(tokenAddress)
}
