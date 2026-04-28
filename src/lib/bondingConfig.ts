/**
 * Fetch bonding curve limit/threshold from contracts.
 * Used for correct progress calculation and display (e.g. "X / Y ETH" or "X / Y SOL").
 */

import { readContract } from 'viem/actions'
import { getEvmPublicClient } from './evmRpcClients'
import { getFactoryAddress } from './addressHelpers'
import FactoryAbi from './abis/FactoryUpgradeableABI.json'
import { bondingLimits, SOLANA_BONDING_LIMIT_SOL } from './constants'
import { isSolanaChain } from './chainUtils'
import { Keypair } from '@solana/web3.js'
import { SolanaProgram } from './solana/program'
import { getCachedGlobalConfig, setCachedGlobalConfig } from './solana/cache'

/** EVM bonding limit cache: chainId -> { value, fetchedAt } */
const evmBondingLimitCache: Record<number, { value: number; fetchedAt: number }> = {}
const EVM_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/** In-flight promise for EVM deduplication */
const pendingEvmLimit: Record<number, Promise<number>> = {}

/** EVM: Fetch bonding limit from Factory (in native ETH). Uses custom RPC + cache to avoid 429/CORS. */
export async function fetchEVMBondingLimit(chainId: number): Promise<number> {
  const cached = evmBondingLimitCache[chainId]
  if (cached && Date.now() - cached.fetchedAt < EVM_CACHE_TTL_MS) return cached.value

  if (chainId in pendingEvmLimit) return pendingEvmLimit[chainId]

  const doFetch = async (): Promise<number> => {
    try {
      const factoryAddress = getFactoryAddress(chainId)
      if (!factoryAddress) return bondingLimits[chainId] ?? 2
      const client = getEvmPublicClient(chainId)
      const limitWei = await readContract(client, {
        address: factoryAddress as `0x${string}`,
        abi: FactoryAbi as any,
        functionName: 'bondingLimit',
      })
      const wei = typeof limitWei === 'bigint' ? limitWei : BigInt(String(limitWei))
      const value = Number(wei) / 1e18
      evmBondingLimitCache[chainId] = { value, fetchedAt: Date.now() }
      return value
    } catch (e) {
      console.warn('Failed to fetch EVM bonding limit from contract:', e)
      return bondingLimits[chainId] ?? 2
    } finally {
      delete pendingEvmLimit[chainId]
    }
  }

  pendingEvmLimit[chainId] = doFetch()
  return pendingEvmLimit[chainId]
}

/** In-flight promise for deduplication: avoid multiple concurrent getGlobalConfig RPC calls. */
let pendingSolanaThreshold: Promise<number> | null = null

/** Solana: Fetch real_sol_threshold from GlobalConfig (in SOL). Uses cache + in-flight deduplication to avoid 429. */
export async function fetchSolanaBondingThreshold(): Promise<number> {
  const defaultThreshold = bondingLimits['solana'] ?? SOLANA_BONDING_LIMIT_SOL

  const cached = getCachedGlobalConfig()
  if (cached != null && cached > 0) return cached

  // Deduplicate: if a request is already in flight, await it instead of starting another
  if (pendingSolanaThreshold) return pendingSolanaThreshold

  const doFetch = async (): Promise<number> => {
    try {
      const dummyWallet = {
        publicKey: Keypair.generate().publicKey,
        signTransaction: async (tx: unknown) => tx,
        signAllTransactions: async (txs: unknown[]) => txs
      } as any

      const prog = new SolanaProgram(dummyWallet)
      const cfg = await prog.getGlobalConfig()

      if (cfg?.realSolThreshold != null && cfg.realSolThreshold > 0) {
        const valueSol = cfg.realSolThreshold / 1e9
        setCachedGlobalConfig(valueSol)
        return valueSol
      }
      return defaultThreshold
    } catch (e) {
      console.warn('[bondingConfig] Failed to fetch Solana bonding threshold from contract, using default:', defaultThreshold, e)
      return defaultThreshold
    } finally {
      pendingSolanaThreshold = null
    }
  }

  pendingSolanaThreshold = doFetch()
  return pendingSolanaThreshold
}

/**
 * Fetch bonding limit for the given chain. Returns value in native units (ETH or SOL).
 */
export async function fetchBondingLimitFromContract(
  chain: string,
  chainId?: number
): Promise<number> {
  if (isSolanaChain(chain)) return fetchSolanaBondingThreshold()
  if (chainId) return fetchEVMBondingLimit(chainId)
  return bondingLimits[11155111] ?? 2
}
