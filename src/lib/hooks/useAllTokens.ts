/**
 * Custom hook for fetching all tokens from factory
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { CHAIN_ID, imageUrl, bondingLimits, SOLANA_BONDING_LIMIT_SOL, SOLANA_CHAIN } from '../constants'
import { calculateMarketCap, calculateTokenPriceUSD, calculateSolanaMarketCap, calculateSolanaTokenPriceUSD } from '../tokenCalculations'
import { fetchAllTokensWithBondingCurves, subscribeToBondingCurve, supabase } from '../supabase'
import { fetchBondingLimitFromContract } from '../bondingConfig'

// Check if Supabase is configured
import { useSupabase } from '../constants'

interface TokenListItem {
  chainId?: number
  chain?: string
  progress: number
  tokenName: string
  tokenSymbol: string
  logoUrl: string
  bondingCurveAddress: string
  tokenAddress: string
  depositedAmount: number
  marketCap: number
  tokenPrice: number
  ethPrice?: number
  solPrice?: number
  priceUSD: string
  description: string
  creator: string
  creatorUsername?: string
  createTime: number
  lpCreated: boolean
  twitter?: string | null
  telegram?: string | null
  website?: string | null
  priceChange24h?: number | null
  bondingThreshold?: number
}

export const useAllTokens = (ethPrice: number, solPrice?: number, activeChain?: 'evm' | 'solana') => {
  const [loading, setLoading] = useState(false)
  const [tokens, setTokens] = useState<TokenListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const ethPriceRef = useRef(ethPrice)
  const solPriceRef = useRef(solPrice || 0)
  const activeChainRef = useRef(activeChain || 'evm')
  const isInitialLoad = useRef(true)
  const subscriptionsRef = useRef<Map<string, ReturnType<typeof subscribeToBondingCurve>>>(new Map())

  // Keep refs updated with latest values
  useEffect(() => {
    ethPriceRef.current = ethPrice
  }, [ethPrice])
  
  useEffect(() => {
    if (solPrice) {
      solPriceRef.current = solPrice
    }
  }, [solPrice])
  
  useEffect(() => {
    activeChainRef.current = activeChain || 'evm'
  }, [activeChain])

  // Helper function to check if token data has changed
  const hasTokenChanged = (oldToken: TokenListItem | undefined, newToken: TokenListItem): boolean => {
    if (!oldToken) return true
    return (
      oldToken.progress !== newToken.progress ||
      oldToken.marketCap !== newToken.marketCap ||
      oldToken.tokenPrice !== newToken.tokenPrice ||
      oldToken.depositedAmount !== newToken.depositedAmount ||
      oldToken.priceUSD !== newToken.priceUSD ||
      oldToken.tokenName !== newToken.tokenName ||
      oldToken.tokenSymbol !== newToken.tokenSymbol ||
      oldToken.description !== newToken.description ||
      oldToken.creator !== newToken.creator ||
      oldToken.createTime !== newToken.createTime
    )
  }

  // Create a stable fetch function that uses the ref
  const fetchTokens = useCallback(async () => {
    const currentEthPrice = ethPriceRef.current
    if (!currentEthPrice) return

    // If Supabase is not configured, return early
    if (!useSupabase) {
      setError('Supabase is not configured')
      return
    }

    try {
      // Only show loading on initial load
      if (isInitialLoad.current) {
        setLoading(true)
      }
      setError(null)
      const newLists: TokenListItem[] = []
      const chainId = CHAIN_ID
      const currentEthPrice = ethPriceRef.current
      const currentSolPrice = solPriceRef.current
      const currentActiveChain = activeChainRef.current

      // Fetch bonding limit/threshold from contract for correct progress
      const bondingLimitFromContract = await fetchBondingLimitFromContract(
        currentActiveChain,
        currentActiveChain === 'evm' ? chainId : undefined
      )

      // Fetch all tokens with bonding curve data from database (both EVM and Solana)
      const tokensWithBondingCurves = await fetchAllTokensWithBondingCurves(chainId)

      if (tokensWithBondingCurves && tokensWithBondingCurves.length > 0) {
        // Process each token
        for (const tokenData of tokensWithBondingCurves) {
          try {
            const token = tokenData
            const bondingCurve = tokenData.bondingCurve

            // Skip if no bonding curve data
            if (!bondingCurve) {
              console.warn(`No bonding curve data for token ${token.token_address}`)
              continue
            }

            // Extract data from database
            const name = token.name || ''
            const symbol = token.symbol || ''
            const description = token.description || ''
            const chain = token.chain || 'evm' // Get chain from token data
            const isSolana = chain === SOLANA_CHAIN
            
            // Filter by active chain if specified
            const currentActiveChain = activeChainRef.current
            if (currentActiveChain) {
              if (currentActiveChain === 'evm' && isSolana) continue
              if (currentActiveChain === 'solana' && !isSolana) continue
            }
            
            // Normalize addresses based on chain (Solana addresses are base58, don't lowercase)
            const tokenAddress = isSolana ? (token.token_address || '') : (token.token_address?.toLowerCase() || '')
            const bondingCurveAddress = isSolana ? (token.bonding_curve_address || '') : (token.bonding_curve_address?.toLowerCase() || '')
            const creator = isSolana ? (token.creator || '') : (token.creator?.toLowerCase() || '')
            const createTime = Number(token.timestamp) || 0
            const twitter = token.twitter || null
            const telegram = token.telegram || null
            const website = token.website || null

            // Get values from bonding curve (convert from string to number)
            const virtualEthLp = Number(bondingCurve.virtual_eth_lp) || 0
            const realEthLp = Number(bondingCurve.real_eth_lp) || 0
            const tokenPrice = Number(bondingCurve.current_price) || 0
            const volume = Number(bondingCurve.volume) || 0
            const lpCreated = bondingCurve.lp_created || false

            // Get 24h price change from database (already calculated on backend)
            const priceChange24h = token.price_change_24h !== null && token.price_change_24h !== undefined 
              ? Number(token.price_change_24h) 
              : null

            // Use appropriate price based on chain
            const basePrice = isSolana ? currentSolPrice : currentEthPrice
            
            const marketCap = isSolana
              ? calculateSolanaMarketCap(tokenPrice, currentSolPrice)
              : calculateMarketCap(tokenPrice, basePrice)
            // For Solana, convert lamports to SOL (divide by 1e9)
            const volumeInNative = isSolana ? volume / 1e9 : volume / 1e18
            const depositedAmount = volumeInNative * basePrice
            
            // Use bonding limit from contract; fallback to constants if fetch failed
            const bondingLimit = bondingLimitFromContract > 0
              ? bondingLimitFromContract
              : (isSolana ? (bondingLimits['solana'] ?? SOLANA_BONDING_LIMIT_SOL) : (bondingLimits[chainId] || 0.1))
            const realLpInNative = isSolana ? realEthLp / 1e9 : realEthLp / 1e18
            const progress = lpCreated ? 100 : Math.min((realLpInNative / bondingLimit) * 100, 100)

            // Use token address for logo
            const logoAddress = tokenAddress || bondingCurveAddress
            const logoUrl = imageUrl + 'tokens/' + logoAddress.toLowerCase() + '-logo.png'
            const priceUSD = isSolana
              ? calculateSolanaTokenPriceUSD(tokenPrice, currentSolPrice)
              : calculateTokenPriceUSD(tokenPrice, basePrice)

            // Get creator username from profile if available
            const creatorUsername = tokenData.creatorProfile?.username || null

            newLists.push({
              chainId: isSolana ? undefined : chainId,
              chain: chain,
              progress,
              bondingThreshold: bondingLimit,
              tokenName: name,
              tokenSymbol: symbol,
              logoUrl,
              bondingCurveAddress,
              tokenAddress,
              depositedAmount,
              marketCap,
              tokenPrice,
              ethPrice: isSolana ? undefined : currentEthPrice,
              solPrice: isSolana ? currentSolPrice : undefined,
              priceUSD,
              description,
              creator,
              creatorUsername,
              createTime,
              lpCreated,
              twitter,
              telegram,
              website,
              priceChange24h
            })
          } catch (err) {
            console.error(`Error processing token data:`, err)
            // Continue with next token if one fails
          }
        }
      }

        // Only update tokens if data has actually changed
      setTokens(prevTokens => {
        // If it's the initial load or tokens count changed, return new list
        if (isInitialLoad.current || prevTokens.length !== newLists.length) {
          isInitialLoad.current = false
          
          // Set up real-time subscriptions for all bonding curves
          if (useSupabase) {
            // Clean up old subscriptions
            subscriptionsRef.current.forEach((sub) => {
              supabase.removeChannel(sub)
            })
            subscriptionsRef.current.clear()

            // Subscribe to each bonding curve for real-time updates
            newLists.forEach(token => {
              if (token.bondingCurveAddress) {
                const subscription = subscribeToBondingCurve(
                  token.bondingCurveAddress,
                  (updatedBondingCurve) => {
                    // Update the specific token when its bonding curve changes
                    setTokens(prev => prev.map(t => {
                      const key = t.tokenAddress || t.bondingCurveAddress
                      const tokenKey = token.tokenAddress || token.bondingCurveAddress
                      
                      if (key === tokenKey) {
                        const realEthLp = Number(updatedBondingCurve.real_eth_lp) || 0
                        const tokenPrice = Number(updatedBondingCurve.current_price) || 0
                        const volume = Number(updatedBondingCurve.volume) || 0
                        // Sticky: once true, never false (LP creation is irreversible; prevents trading re-enable during update cycles)
                        const lpCreated = t.lpCreated || !!(updatedBondingCurve.lp_created)
                        const isSolana = t.chain === SOLANA_CHAIN

                        // Use token's contract-derived threshold when available
                        const bondingLimit = (t.bondingThreshold != null && t.bondingThreshold > 0)
                          ? t.bondingThreshold
                          : (isSolana ? (bondingLimits['solana'] ?? SOLANA_BONDING_LIMIT_SOL) : (bondingLimits[chainId] || 0.1))
                        // Same progress formula as initial fetch: real reserves in native units
                        const realLpInNative = isSolana ? realEthLp / 1e9 : realEthLp / 1e18
                        const progress = lpCreated ? 100 : Math.min((realLpInNative / bondingLimit) * 100, 100)

                        const basePrice = isSolana ? solPriceRef.current : ethPriceRef.current
                        const marketCap = basePrice
                          ? (isSolana ? calculateSolanaMarketCap(tokenPrice, solPriceRef.current) : calculateMarketCap(tokenPrice, basePrice))
                          : t.marketCap
                        const volumeInNative = isSolana ? volume / 1e9 : volume / 1e18
                        const depositedAmount = basePrice ? volumeInNative * basePrice : t.depositedAmount
                        const priceUSD = basePrice
                          ? (isSolana ? calculateSolanaTokenPriceUSD(tokenPrice, solPriceRef.current) : calculateTokenPriceUSD(tokenPrice, basePrice))
                          : t.priceUSD

                        return {
                          ...t,
                          progress,
                          marketCap,
                          tokenPrice,
                          depositedAmount,
                          priceUSD,
                          lpCreated
                        }
                      }
                      return t
                    }))
                  }
                )
                subscriptionsRef.current.set(token.bondingCurveAddress, subscription)
              }
            })
          }
          
          return newLists
        }

        // Create a map of existing tokens by address for quick lookup
        const tokenMap = new Map<string, TokenListItem>()
        prevTokens.forEach(token => {
          const key = token.tokenAddress || token.bondingCurveAddress
          tokenMap.set(key, token)
        })

        // Check if any token has changed
        let hasChanges = false
        const updatedTokens = newLists.map(newToken => {
          const key = newToken.tokenAddress || newToken.bondingCurveAddress
          const oldToken = tokenMap.get(key)
          
          if (hasTokenChanged(oldToken, newToken)) {
            hasChanges = true
            // lpCreated is sticky: once true, never false (LP creation is irreversible)
            const lpCreated = oldToken?.lpCreated || newToken.lpCreated
            return { ...newToken, lpCreated }
          }
          // Return old token reference if nothing changed (prevents re-render)
          return oldToken || newToken
        })

        // Only update state if something actually changed
        return hasChanges ? updatedTokens : prevTokens
      })

      isInitialLoad.current = false
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tokens')
      console.error('Error fetching tokens:', err)
    } finally {
      setLoading(false)
    }
  }, []) // Empty deps - function uses ref for ethPrice

  // Removed polling interval - real-time updates come from Supabase subscriptions
  // Only fetch on initial load or when ethPrice becomes available
  // Clean up subscriptions when component unmounts
  useEffect(() => {
    return () => {
      subscriptionsRef.current.forEach((sub) => {
        supabase.removeChannel(sub)
      })
      subscriptionsRef.current.clear()
    }
  }, [])

  // Initial fetch when ethPrice becomes available (only once)
  const hasInitiallyFetched = useRef(false)
  useEffect(() => {
    if (ethPrice && !hasInitiallyFetched.current) {
      hasInitiallyFetched.current = true
      fetchTokens()
    }
  }, [ethPrice, fetchTokens])
  
  // Re-fetch when activeChain changes (after initial fetch)
  const previousChain = useRef(activeChain)
  useEffect(() => {
    if (hasInitiallyFetched.current && activeChain !== previousChain.current) {
      previousChain.current = activeChain
      fetchTokens()
    }
  }, [activeChain, fetchTokens])

  // Update one token's bonding-curve–related fields from chain (e.g. after swap) so list shows current state
  // lpCreated is sticky: once true, never false (LP creation is irreversible)
  const updateTokenByBondingCurve = useCallback((bondingCurveAddress: string, patch: Partial<TokenListItem>) => {
    setTokens(prev => prev.map(t => {
      if (t.bondingCurveAddress !== bondingCurveAddress && t.tokenAddress !== bondingCurveAddress) return t
      const merged = { ...t, ...patch }
      if (patch.lpCreated !== undefined && t.lpCreated) {
        merged.lpCreated = true // Sticky: never overwrite true with false
      }
      return merged
    }))
  }, [])

  return { tokens, loading, error, refetch: fetchTokens, updateTokenByBondingCurve }
}

