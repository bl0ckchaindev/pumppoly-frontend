import React, { useState, useEffect, useRef, memo } from 'react'
import PropTypes from 'prop-types'
import { scanLinks } from '../../lib/constants.ts'

const HoldersCard = ({ tokenAddress, chainId, bondingCurveAddress }) => {
  const [tokenHolders, setTokenHolders] = useState([])
  const [loading, setLoading] = useState(false)
  const previousHoldersRef = useRef([])
  const isInitialLoadRef = useRef(true)

  useEffect(() => {
    // Reset previous holders and initial load flag when token address changes
    previousHoldersRef.current = []
    isInitialLoadRef.current = true
    setTokenHolders([])
  }, [tokenAddress])

  useEffect(() => {
    const fetchHolders = async () => {
      if (!tokenAddress || !chainId) {
        setTokenHolders([])
        previousHoldersRef.current = []
        isInitialLoadRef.current = true
        return
      }

      try {
        // Only show loading on initial fetch
        if (isInitialLoadRef.current) {
          setLoading(true)
        }
        
        const response = await fetch(
          `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/owners?chain=0x${Number(chainId).toString(16)}&order=DESC`,
          {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'X-API-Key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjRhYmNiMTU4LTkwMTktNGRhNC1hMTVjLTBhMTI1ZGMwMTlmNCIsIm9yZ0lkIjoiMTg4MDcwIiwidXNlcklkIjoiMTg3NzQyIiwidHlwZUlkIjoiMTUyZTkyMzgtMjljOC00ZDkzLWE3Y2ItOTA4OGQ5MzgxOGFjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MzYyMDkxMTIsImV4cCI6NDg5MTk2OTExMn0.wVpUUXKpEWOJEVBvMRCQNzbqMTYa-n4Qvhx-hX3YeDk'
            }
          }
        )
        const data = await response.json()
        if (data.result) {
          const processedHolders = data.result.map(item => ({
            address: item.owner_address,
            value: Number(item.percentage_relative_to_total_supply)
          }))
          
          // Compare with previous data - only update if values changed
          const previous = previousHoldersRef.current
          const hasChanges = processedHolders.length !== previous.length ||
            processedHolders.some((newHolder, index) => {
              const oldHolder = previous[index]
              return !oldHolder || 
                     oldHolder.address.toLowerCase() !== newHolder.address.toLowerCase() || 
                     Math.abs(oldHolder.value - newHolder.value) > 0.01 // Only update if percentage changed by more than 0.01%
            })
          
          if (hasChanges || isInitialLoadRef.current) {
            setTokenHolders(processedHolders)
            previousHoldersRef.current = processedHolders
            isInitialLoadRef.current = false
          }
        } else {
          if (tokenHolders.length > 0) {
            setTokenHolders([])
            previousHoldersRef.current = []
          }
          isInitialLoadRef.current = false
        }
      } catch (e) {
        console.error('Error fetching holders:', e)
        if (tokenHolders.length > 0) {
          setTokenHolders([])
          previousHoldersRef.current = []
        }
        isInitialLoadRef.current = false
      } finally {
        setLoading(false)
      }
    }

    fetchHolders()
    // Removed automatic polling - holders data doesn't change frequently
    // Only fetch on mount or when token address/chainId changes
    // If real-time updates are needed, consider adding Supabase subscription
  }, [tokenAddress, chainId])

  return (
    <div style={{
      background: '#111',
      border: '1px solid #333',
      borderRadius: '8px',
      padding: '30px'
    }}>
      <h3 style={{ color: '#fff', marginBottom: '20px' }}>Holders Distribution</h3>
      {loading ? (
        <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
          Loading holders...
        </div>
      ) : tokenHolders.length === 0 ? (
        <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
          No holders data available
        </div>
      ) : (
        <div>
          {tokenHolders.slice(0, 10).map((holder) => {
            const isBondingCurve = bondingCurveAddress && 
              holder.address.toLowerCase() === bondingCurveAddress.toLowerCase()
            const displayText = isBondingCurve ? 'Liquidity Pool' : (holder.address.slice(0, 5) + '...' + holder.address.slice(-3))
            
            return (
              <div key={holder.address} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                background: '#1a2d1d',
                borderRadius: '8px',
                marginBottom: '8px'
              }}>
                <a
                  href={`${scanLinks[chainId]}address/${holder.address}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: '#a5ada6',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {displayText}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a5ada6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6"></path>
                    <path d="M10 14 21 3"></path>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  </svg>
                </a>
                <span style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>
                  {holder.value.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

HoldersCard.propTypes = {
  tokenAddress: PropTypes.string,
  chainId: PropTypes.string,
  bondingCurveAddress: PropTypes.string
}

export default memo(HoldersCard)

