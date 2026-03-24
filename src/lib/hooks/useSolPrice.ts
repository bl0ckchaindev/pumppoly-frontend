/**
 * Custom hook for fetching SOL price
 */

import { useState, useEffect } from 'react'
import { solPriceApiUrl } from '../constants'

export const useSolPrice = () => {
  const [solPrice, setSolPrice] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        setLoading(true)
        const response = await fetch(solPriceApiUrl)
        const data = await response.json()
        const price = data.USD
        
        if (price) {
          setSolPrice(price)
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch SOL price')
        console.error('Error fetching SOL price:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSolPrice()
    const interval = setInterval(fetchSolPrice, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  return { solPrice, loading, error }
}

