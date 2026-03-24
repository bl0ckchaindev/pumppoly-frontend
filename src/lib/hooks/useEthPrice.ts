/**
 * Custom hook for fetching ETH price
 */

import { useState, useEffect } from 'react'
import { ethPriceApiUrl, CHAIN_ID } from '../constants'

export const useEthPrice = () => {
  const [ethPrice, setEthPrice] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        setLoading(true)
        const response = await fetch(ethPriceApiUrl[CHAIN_ID])
        const data = await response.json()
        const price = data.USD
        
        if (price) {
          setEthPrice(price)
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch ETH price')
        console.error('Error fetching ETH price:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchEthPrice()
    const interval = setInterval(fetchEthPrice, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  return { ethPrice, loading, error }
}

