/**
 * Chain slug helpers (align with backend `tokens.chain`: solana, base, polygon, bsc, eth, …).
 */

export function isSolanaChain(chain: string | null | undefined): boolean {
  return String(chain || '').toLowerCase() === 'solana'
}

export function isEvmCompatibleChain(chain: string | null | undefined): boolean {
  const s = String(chain || '').trim()
  return s.length > 0 && !isSolanaChain(chain)
}

/** Must match backend `EVM_CHAIN_SLUG` / how rows are stored for this deployment’s EVM RPC. */
export function defaultEvmChainSlug(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_EVM_CHAIN_SLUG) {
    return String(process.env.NEXT_PUBLIC_EVM_CHAIN_SLUG).toLowerCase()
  }
  return 'evm'
}
