'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { calculateTokenPriceUSD, calculateSolanaTokenPriceUSD, calculateMarketCap, calculateSolanaMarketCap, calculateVolumeUSD, formatTokenPriceDisplay } from '../../lib/tokenCalculations.ts'
import { formatMarketCap, formatNumberWithSuffix } from '../../lib/formatting.ts'
import { imageUrl } from '../../lib/constants.ts'
import './ListViewRow.css'

// List View Row Component
/**
 * @param {Object} props
 * @param {any} props.token
 * @param {any} props.ethPrice
 * @param {number} [props.solPrice] - SOL price in USD (for Solana tokens)
 * @param {Function|null} [props.onTokenClick] - Optional click handler
 */
export const ListViewRow = ({ token, ethPrice, solPrice, onTokenClick = null }) => {
  const [isMobile, setIsMobile] = useState(false)
  const isSolana = token?.chain === 'solana'
  const basePrice = isSolana ? (token.solPrice ?? solPrice ?? 0) : (ethPrice ?? 0)
  const tokenLogoUrl = imageUrl + 'tokens/' + (token.tokenAddress || '').toLowerCase() + '-logo.png'
  const firstLetter = token.tokenSymbol?.charAt(0).toUpperCase() || '?'
  const priceUSDStr = isSolana ? calculateSolanaTokenPriceUSD(token.tokenPrice || 0, basePrice) : calculateTokenPriceUSD(token.tokenPrice || 0, basePrice)
  const priceUSD = formatTokenPriceDisplay(priceUSDStr)
  const marketCap = isSolana ? calculateSolanaMarketCap(token.tokenPrice || 0, basePrice) : calculateMarketCap(token.tokenPrice || 0, basePrice)
  // From useAllTokens, depositedAmount is already volume in USD; fallback to ETH formula only for legacy wei volume
  const volumeUSD = (token.depositedAmount != null && typeof token.depositedAmount === 'number')
    ? token.depositedAmount
    : (isSolana ? 0 : calculateVolumeUSD(Number(token.depositedAmount) || 0, basePrice))
  const priceChange24h = token.priceChange24h !== null && token.priceChange24h !== undefined ? token.priceChange24h : null
  const isPositive = priceChange24h !== null ? priceChange24h >= 0 : true

  useEffect(() => {
    const checkMobile = () => {
      if (typeof window !== 'undefined') {
        setIsMobile(window.innerWidth < 768)
      }
    }
    checkMobile()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', checkMobile)
      return () => window.removeEventListener('resize', checkMobile)
    }
  }, [])

  const rowContent = (
    <>
      {isMobile ? (
        <div className="list-view-card">
          <div className="list-view-card-header">
            <div className="list-view-card-logo">
              {token.logoUrl ? (
                <img 
                  src={token.logoUrl} 
                  alt={token.tokenSymbol}
                  className="list-view-logo-img"
                />
              ) : (
                <div className="list-view-logo-placeholder">
                  <span>{firstLetter}</span>
                </div>
              )}
            </div>
            <div className="list-view-card-name-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div className="list-view-token-name">{token.tokenName}</div>
                {token.lpCreated && (
                  <span className="listed-badge">Listed</span>
                )}
              </div>
              <div className="list-view-token-symbol">${token.tokenSymbol}</div>
            </div>
          </div>
          <div className="list-view-card-body">
            <div className="list-view-card-row">
              <div className="list-view-card-label">Price</div>
              <div className="list-view-card-value">${priceUSD}</div>
            </div>
            <div className="list-view-card-row">
              <div className="list-view-card-label">24H</div>
              <div className="list-view-card-value">
                {priceChange24h !== null ? (
                  <span className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
                    {isPositive ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginRight: '4px', verticalAlign: 'middle' }}>
                        <path d="M18 15l-6-6-6 6"/>
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginRight: '4px', verticalAlign: 'middle' }}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    )}
                    {isPositive ? '+' : ''}{priceChange24h.toFixed(2)}%
                  </span>
                ) : (
                  <span className="price-change">-</span>
                )}
              </div>
            </div>
            <div className="list-view-card-row">
              <div className="list-view-card-label">MCAP</div>
              <div className="list-view-card-value">{formatMarketCap(marketCap)}</div>
            </div>
            <div className="list-view-card-row">
              <div className="list-view-card-label">VOL</div>
              <div className="list-view-card-value">{formatNumberWithSuffix(volumeUSD)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="list-view-row">
          <div className="list-view-cell list-view-logo">
            {token.logoUrl ? (
              <img 
                src={token.logoUrl} 
                alt={token.tokenSymbol}
                className="list-view-logo-img"
              />
            ) : (
              <div className="list-view-logo-placeholder">
                <span>{firstLetter}</span>
              </div>
            )}
          </div>
          <div className="list-view-cell list-view-name">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div className="list-view-token-name">{token.tokenName}</div>
              {token.lpCreated && (
                <span className="listed-badge">Listed</span>
              )}
            </div>
            <div className="list-view-token-symbol">${token.tokenSymbol}</div>
          </div>
          <div className="list-view-cell list-view-price">
            ${priceUSD}
          </div>
          <div className="list-view-cell list-view-change">
            {priceChange24h !== null ? (
              <span className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
                {isPositive ? '+' : ''}{priceChange24h.toFixed(2)}%
              </span>
            ) : (
              <span className="price-change">-</span>
            )}
          </div>
          <div className="list-view-cell list-view-marketcap">
            {formatMarketCap(marketCap)}
          </div>
          <div className="list-view-cell list-view-volume">
            {formatNumberWithSuffix(volumeUSD)}
          </div>
        </div>
      )}
    </>
  )

  if (onTokenClick) {
    return (
      <div onClick={onTokenClick} style={{ textDecoration: 'none', display: 'block' }}>
        {rowContent}
      </div>
    )
  }

  return (
    <Link 
      href={`/token/${token.tokenAddress}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      {rowContent}
    </Link>
  )
}
