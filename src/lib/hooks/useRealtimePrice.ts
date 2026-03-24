import { useState, useEffect, useRef } from 'react'
import { 
  supabase, 
  subscribeToBondingCurve, 
  subscribeToPriceUpdates,
  subscribeToTrades,
  fetchBondingCurve,
  fetchTokenPriceData,
  fetchTradeHistory,
  BondingCurve,
  TokenPriceData,
  TradeHistory
} from '../supabase'

// Check if Supabase is configured
import { useSupabase } from '../constants'

interface UseRealtimePriceResult {
  bondingCurve: BondingCurve | null
  priceData: TokenPriceData[]
  trades: TradeHistory[]
  loading: boolean
  error: Error | null
  isRealtime: boolean
}

export function useRealtimePrice(
  bondingCurveAddress: string | undefined,
  tokenAddress: string | undefined
): UseRealtimePriceResult {
  const [bondingCurve, setBondingCurve] = useState<BondingCurve | null>(null)
  const [priceData, setPriceData] = useState<TokenPriceData[]>([])
  const [trades, setTrades] = useState<TradeHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  const bondingSubscriptionRef = useRef<ReturnType<typeof subscribeToBondingCurve> | null>(null)
  const priceSubscriptionRef = useRef<ReturnType<typeof subscribeToPriceUpdates> | null>(null)
  const tradesSubscriptionRef = useRef<ReturnType<typeof subscribeToTrades> | null>(null)

  useEffect(() => {
    if (!useSupabase || !bondingCurveAddress || !tokenAddress) {
      setLoading(false)
      return
    }

    const loadInitialData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch initial data in parallel
        const [bcData, priceHistory, tradeHistory] = await Promise.all([
          fetchBondingCurve(bondingCurveAddress),
          fetchTokenPriceData(tokenAddress, 500),
          fetchTradeHistory(tokenAddress, 100)
        ])

        setBondingCurve(bcData)
        setPriceData(priceHistory)
        setTrades(tradeHistory)
      } catch (err) {
        console.error('Error loading realtime price data:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()

    // Subscribe to real-time updates
    bondingSubscriptionRef.current = subscribeToBondingCurve(
      bondingCurveAddress,
      (updatedCurve) => {
        setBondingCurve(updatedCurve)
      }
    )

    priceSubscriptionRef.current = subscribeToPriceUpdates(
      tokenAddress,
      (newPriceData) => {
        setPriceData(prev => {
          // Check if already exists
          const exists = prev.some(p => p.transaction_hash === newPriceData.transaction_hash)
          if (exists) return prev
          return [newPriceData, ...prev].slice(0, 500) // Keep last 500
        })
      }
    )

    tradesSubscriptionRef.current = subscribeToTrades(
      tokenAddress,
      (newTrade) => {
        setTrades(prev => {
          const exists = prev.some(t => t.transaction_hash === newTrade.transaction_hash)
          if (exists) return prev
          return [newTrade, ...prev].slice(0, 100) // Keep last 100
        })
      }
    )

    // Cleanup subscriptions
    return () => {
      if (bondingSubscriptionRef.current) {
        supabase.removeChannel(bondingSubscriptionRef.current)
      }
      if (priceSubscriptionRef.current) {
        supabase.removeChannel(priceSubscriptionRef.current)
      }
      if (tradesSubscriptionRef.current) {
        supabase.removeChannel(tradesSubscriptionRef.current)
      }
    }
  }, [bondingCurveAddress, tokenAddress])

  return {
    bondingCurve,
    priceData,
    trades,
    loading,
    error,
    isRealtime: useSupabase
  }
}

// Hook for just bonding curve updates (lighter weight)
export function useRealtimeBondingCurve(bondingCurveAddress: string | undefined) {
  const [bondingCurve, setBondingCurve] = useState<BondingCurve | null>(null)
  const [loading, setLoading] = useState(true)
  const subscriptionRef = useRef<ReturnType<typeof subscribeToBondingCurve> | null>(null)

  useEffect(() => {
    if (!useSupabase || !bondingCurveAddress) {
      setLoading(false)
      return
    }

    const loadData = async () => {
      try {
        const data = await fetchBondingCurve(bondingCurveAddress)
        setBondingCurve(data)
      } catch (err) {
        console.error('Error loading bonding curve:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()

    subscriptionRef.current = subscribeToBondingCurve(
      bondingCurveAddress,
      (updated) => setBondingCurve(updated)
    )

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
      }
    }
  }, [bondingCurveAddress])

  return { bondingCurve, loading, isRealtime: useSupabase }
}

