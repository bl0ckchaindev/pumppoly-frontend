'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useChain } from '../../lib/context/ChainContext'
import apiService from '../../lib/api'
import { formatTokenPriceDisplay } from '../../lib/tokenCalculations'

// Global cache to persist data across component remounts (per chain)
const feeCache: {
  solana: {
    walletAddress: string | null
    traderFee: string
    creatorFee: string
    isTraderFeeCapped: boolean
    lastFetchTime: number
  }
  evm: {
    walletAddress: string | null
    traderFee: string
    creatorFee: string
    isTraderFeeCapped: boolean
    lastFetchTime: number
  }
  nextDistributionAt: string | null
  configLastFetchTime: number
} = {
  solana: {
    walletAddress: null,
    traderFee: '0',
    creatorFee: '0',
    isTraderFeeCapped: false,
    lastFetchTime: 0
  },
  evm: {
    walletAddress: null,
    traderFee: '0',
    creatorFee: '0',
    isTraderFeeCapped: false,
    lastFetchTime: 0
  },
  nextDistributionAt: null,
  configLastFetchTime: 0
}

// Minimum time between fetches (60 seconds) to prevent rapid requests
const MIN_FETCH_INTERVAL = 60000

/**
 * Format fee amount for display.
 * - When the value would round to 0 with displayDecimals (very small), use token price style (e.g. 0.0(4)5).
 * - Otherwise show value with toFixed(displayDecimals).
 */
function formatFeeAmount(value: number, displayDecimals: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0.' + '0'.repeat(displayDecimals)
  }
  const threshold = Math.pow(10, -displayDecimals)
  if (value >= threshold) {
    return value.toFixed(displayDecimals)
  }
  return formatTokenPriceDisplay(value)
}

interface FeeDisplayProps {
  /** When true, renders only the content (no button) for use in modal */
  contentOnly?: boolean
}

/**
 * FeeDisplay component for TopBar - shows trader and creator fees with next claim countdown.
 * Fees are distributed automatically at each round; this displays claimable amounts and time until next distribution.
 * Supports both Solana and EVM chains.
 */
const FeeDisplay: React.FC<FeeDisplayProps> = ({ contentOnly = false }) => {
  const { activeChain, walletAddress, isWalletConnected } = useChain()

  // Get chain-specific cache
  const chainCache = feeCache[activeChain]
  
  const [traderFee, setTraderFee] = useState(chainCache.traderFee)
  const [creatorFee, setCreatorFee] = useState(chainCache.creatorFee)
  const [isTraderFeeCapped, setIsTraderFeeCapped] = useState(chainCache.isTraderFeeCapped)
  const [nextDistributionAt, setNextDistributionAt] = useState<Date | null>(
    feeCache.nextDistributionAt ? new Date(feeCache.nextDistributionAt) : null
  )
  const [countdown, setCountdown] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Ref for click-outside to close (same pattern as wallet connection button)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Refs to prevent issues with stale closures and multiple scheduling
  const distributionTimeRef = useRef<number | null>(null)
  const refetchScheduledRef = useRef(false)
  const isFetchingRef = useRef(false)
  const mountedRef = useRef(true)
  
  // Chain symbol for display
  const nativeSymbol = activeChain === 'evm' ? 'ETH' : 'SOL'
  const decimals = activeChain === 'evm' ? 18 : 9

  // Fetch fees and config - separate from countdown to avoid circular deps
  useEffect(() => {
    mountedRef.current = true
    
    if (!isWalletConnected || !walletAddress) {
      setTraderFee('0')
      setCreatorFee('0')
      setIsTraderFeeCapped(false)
      setNextDistributionAt(null)
      return () => { mountedRef.current = false }
    }

    // Check if we can use cached data (same wallet and recent fetch)
    const now = Date.now()
    const currentChainCache = feeCache[activeChain]
    const canUseCache = 
      currentChainCache.walletAddress === walletAddress && 
      (now - currentChainCache.lastFetchTime) < MIN_FETCH_INTERVAL

    // When wallet or chain changed, clear displayed fees immediately so we don't show previous wallet's data
    if (!canUseCache) {
      setTraderFee('0')
      setCreatorFee('0')
      setIsTraderFeeCapped(false)
    }

    if (canUseCache) {
      // Use cached data for current wallet
      setTraderFee(currentChainCache.traderFee)
      setCreatorFee(currentChainCache.creatorFee)
      setIsTraderFeeCapped(currentChainCache.isTraderFeeCapped)
      if (feeCache.nextDistributionAt) {
        const cachedTime = new Date(feeCache.nextDistributionAt)
        distributionTimeRef.current = cachedTime.getTime()
        setNextDistributionAt(cachedTime)
      }
    }

    const fetchData = async (force = false) => {
      // Prevent concurrent fetches
      if (isFetchingRef.current) return
      
      // Check minimum fetch interval (unless forced)
      const currentCache = feeCache[activeChain]
      const timeSinceLastFetch = Date.now() - currentCache.lastFetchTime
      if (!force && timeSinceLastFetch < MIN_FETCH_INTERVAL && currentCache.walletAddress === walletAddress) {
        return
      }
      
      isFetchingRef.current = true
      
      try {
        const [traderRes, creatorRes, configRes] = await Promise.all([
          apiService.getTraderFeeClaimable(walletAddress, activeChain).catch(() => ({ claimableFormatted: '0', isCapped: false })),
          apiService.getCreatorFeeClaimable(walletAddress, activeChain).catch(() => ({ claimableFormatted: '0' })),
          apiService.getRewardDistributionConfig().catch(() => ({ nextDistributionAt: '' }))
        ])
        
        if (!mountedRef.current) return
        
        // Update state with formatted amount (claimableFormatted exists on both success and catch fallback)
        const traderFeeValue = traderRes.claimableFormatted || '0'
        const creatorFeeValue = creatorRes.claimableFormatted || '0'
        const isCapped = 'isCapped' in traderRes ? traderRes.isCapped : false
        
        setTraderFee(traderFeeValue)
        setCreatorFee(creatorFeeValue)
        setIsTraderFeeCapped(isCapped)
        
        // Update chain-specific cache
        feeCache[activeChain].walletAddress = walletAddress
        feeCache[activeChain].traderFee = traderFeeValue
        feeCache[activeChain].creatorFee = creatorFeeValue
        feeCache[activeChain].isTraderFeeCapped = isCapped
        feeCache[activeChain].lastFetchTime = Date.now()
        
        if (configRes.nextDistributionAt) {
          const newDistTime = new Date(configRes.nextDistributionAt)
          const newDistTimeMs = newDistTime.getTime()
          
          // If distribution time changed (new round started), reset the refetch flag
          if (distributionTimeRef.current !== newDistTimeMs) {
            distributionTimeRef.current = newDistTimeMs
            refetchScheduledRef.current = false
          }
          setNextDistributionAt(newDistTime)
          feeCache.nextDistributionAt = configRes.nextDistributionAt
          feeCache.configLastFetchTime = Date.now()
        }
      } catch (e) {
        console.error('FeeDisplay fetch error:', e)
      } finally {
        isFetchingRef.current = false
      }
    }

    // Initial fetch (skip if we just used cache)
    if (!canUseCache) {
      fetchData(true)
    }
    
    // Periodic fetch every 60 seconds (aligned with MIN_FETCH_INTERVAL)
    const interval = setInterval(() => fetchData(true), MIN_FETCH_INTERVAL)
    
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [isWalletConnected, walletAddress, activeChain])

  // Countdown timer - separate effect, does not trigger refetch directly
  useEffect(() => {
    if (!nextDistributionAt) {
      setCountdown('')
      return
    }

    const updateCountdown = () => {
      const now = Date.now()
      const targetTime = nextDistributionAt.getTime()
      const diff = targetTime - now
      
      if (diff <= 0) {
        setCountdown('Distributing...')
        
        // Only schedule ONE refetch when countdown reaches zero
        if (!refetchScheduledRef.current) {
          refetchScheduledRef.current = true
          
          // Schedule a single refetch after 15 seconds to get the new distribution time
          setTimeout(async () => {
            if (isFetchingRef.current) return
            isFetchingRef.current = true
            
            try {
              const configRes = await apiService.getRewardDistributionConfig().catch(() => ({ nextDistributionAt: '' }))
              if (configRes.nextDistributionAt) {
                const newDistTime = new Date(configRes.nextDistributionAt)
                const newDistTimeMs = newDistTime.getTime()
                
                // Update if it's a new distribution time
                if (distributionTimeRef.current !== newDistTimeMs) {
                  distributionTimeRef.current = newDistTimeMs
                  refetchScheduledRef.current = false
                  setNextDistributionAt(newDistTime)
                }
              }
            } catch (e) {
              console.error('FeeDisplay config refetch error:', e)
            } finally {
              isFetchingRef.current = false
            }
          }, 15000)
        }
        return
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      
      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`)
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`)
      } else {
        setCountdown(`${seconds}s`)
      }
    }
    
    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [nextDistributionAt])

  // Close fees dropdown when clicking outside (same as wallet connection button)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false)
      }
    }

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isExpanded])

  // Don't render if wallet not connected (unless contentOnly for modal)
  if (!isWalletConnected || !walletAddress) {
    if (contentOnly) {
      return (
        <div className="w-64 bg-black/95 border border-purple-primary/50 rounded-lg p-6 text-center">
          <p className="text-gray-400 text-sm">Connect your wallet to view fees</p>
        </div>
      )
    }
    return null
  }

  const traderFeeNum = parseFloat(traderFee)
  const creatorFeeNum = parseFloat(creatorFee)
  const totalFee = traderFeeNum + creatorFeeNum
  const hasFees = totalFee > 0
  
  // Format display value (4 decimals for compact, 6 for expanded)
  const displayDecimals = activeChain === 'evm' ? 6 : 4

  const feesContent = (
    <div
      className="w-64 bg-black/95 border border-purple-primary/50 rounded-lg shadow-lg overflow-hidden"
      style={{ boxShadow: '0 0 20px rgba(147, 51, 234, 0.3)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-purple-primary/30 bg-purple-primary/10">
        <div className="flex justify-between items-center">
          <div className="text-purple-primary font-semibold text-sm">Pending Rewards</div>
          <div className="text-xs text-gray-400 uppercase">{activeChain}</div>
        </div>
        <div className="text-xs text-gray-400 mt-1">Auto-distributed every round</div>
      </div>

      {/* Trader Fees */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-sm">Trader Fees</span>
            {isTraderFeeCapped && (
              <span className="text-xs text-yellow-500" title="Capped at 2% of total rewards pool">(max)</span>
            )}
          </div>
          <span className="text-white font-medium">{formatFeeAmount(traderFeeNum, displayDecimals)} {nativeSymbol}</span>
        </div>
      </div>

      {/* Creator Fees */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Creator Fees</span>
          <span className="text-white font-medium">{formatFeeAmount(creatorFeeNum, displayDecimals)} {nativeSymbol}</span>
        </div>
      </div>

      {/* Next Distribution */}
      <div className="px-4 py-3 bg-purple-primary/5">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Next Claim</span>
          <span className="text-purple-primary font-semibold">{countdown || 'Loading...'}</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Rewards are sent automatically to your wallet
        </div>
      </div>
    </div>
  )

  if (contentOnly) {
    return feesContent
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Compact display - click to expand */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-primary/50 bg-purple-primary/10 text-white text-sm transition-all hover:bg-purple-primary/20 hover:border-purple-primary"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <span className="hidden sm:inline text-purple-primary font-medium">
          {hasFees ? `${formatFeeAmount(totalFee, displayDecimals)} ${nativeSymbol}` : 'Fees'}
        </span>
        <span className="text-xs text-gray-400">
          {countdown || '--:--'}
        </span>
      </button>

      {/* Expanded dropdown */}
      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 z-50 justify-center items-center">
          {feesContent}
        </div>
      )}
    </div>
  )
}

export default FeeDisplay
