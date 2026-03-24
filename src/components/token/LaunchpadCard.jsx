'use client'
import React, { memo, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { readContract, writeContract } from '@wagmi/core'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '../../lib/config.jsx'
import { calculateTokenPriceUSD, calculateSolanaTokenPriceUSD, formatTokenPriceDisplay } from '../../lib/tokenCalculations.ts'
import { formatMarketCap, formatCreateTime } from '../../lib/formatting.ts'
import { apiUrl, imageUrl } from '../../lib/constants.ts'
import { fetchProfile } from '../../lib/supabase.ts'
import ChadAbi from '../../lib/abis/BondingCurveABI.json'
import './LaunchpadCard.css'

import { useSupabase } from '../../lib/constants'

const LaunchpadCard = memo(({
  chainId,
  chain,
  progress,
  tokenName,
  tokenSymbol,
  logoUrl,
  bondingCurveAddress,
  tokenAddress,
  marketCap,
  tokenPrice,
  ethPrice,
  solPrice,
  depositedAmount,
  description,
  creator,
  creatorUsername: creatorUsernameProp,
  createTime,
  lpCreated = false,
  showCollectButton = true,
  twitter = null,
  telegram = null,
  website = null,
  priceChange24h = null,
  onClick = null,
  bondingThreshold = null
}) => {
  const router = useRouter()
  const [creatorUsername, setCreatorUsername] = useState(creatorUsernameProp || '')
  const { address, isConnected } = useAccount()
  const [isOwner, setIsOwner] = useState(false)
  const [collectingFees, setCollectingFees] = useState(false)
  const isSolana = chain === 'solana'
  const link = isSolana ? `/token/${tokenAddress}?chain=solana` : `/token/${tokenAddress}`
  const displayProgress = Math.min(progress, 100)
  const basePrice = isSolana ? (solPrice || 0) : (ethPrice || 0)
  const priceUSDStr = isSolana ? calculateSolanaTokenPriceUSD(tokenPrice, basePrice) : calculateTokenPriceUSD(tokenPrice, basePrice)
  const priceUSD = formatTokenPriceDisplay(priceUSDStr)

  // Update creator username when prop changes
  useEffect(() => {
    if (creatorUsernameProp) {
      setCreatorUsername(creatorUsernameProp)
    }
  }, [creatorUsernameProp])

  // Fetch creator username from Supabase only if not provided via prop
  useEffect(() => {
    const fetchCreatorUsername = async () => {
      if (!creator || !useSupabase || creatorUsernameProp) return // Don't fetch if already provided
      try {
        const data = await fetchProfile(creator)
        if (data && data[0] && (data[0].name || data[0].username)) {
          setCreatorUsername(data[0].name || data[0].username)
        }
      } catch (err) {
        console.error('Error fetching creator username:', err)
      }
    }
    fetchCreatorUsername()
  }, [creator, creatorUsernameProp])

  // Check if connected wallet is owner
  useEffect(() => {
    const checkOwner = async () => {
      if (isSolana) {
        // Owner/fees collection is EVM-only in this UI
        setIsOwner(false)
        return
      }
      if (!bondingCurveAddress || !isConnected || !address || !chainId) {
        setIsOwner(false)
        return
      }
      
      try {
        const owner = await readContract(config, {
          address: bondingCurveAddress,
          abi: ChadAbi,
          functionName: 'owner',
          chainId: Number(chainId)
        })
        setIsOwner(address.toLowerCase() === owner.toLowerCase())
      } catch (error) {
        console.error('Error checking owner:', error)
        setIsOwner(false)
      }
    }
    checkOwner()
  }, [bondingCurveAddress, isConnected, address, chainId])

  const handleCollectFees = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (isSolana) return
    if (!bondingCurveAddress || !chainId || !isOwner) return

    try {
      setCollectingFees(true)
      const hash = await writeContract(config, {
        address: bondingCurveAddress,
        abi: ChadAbi,
        functionName: 'claimFees',
        chainId: Number(chainId)
      })
      await waitForTransactionReceipt(config, { hash })
      alert('Fees collected successfully!')
    } catch (error) {
      console.error('Error collecting fees:', error)
      alert('Error collecting fees. Please try again.')
    } finally {
      setCollectingFees(false)
    }
  }

  const cardContent = (
    <div className="launchpad-card" style={{
      background: lpCreated ? '#1a0f2e' : '#111',
      border: lpCreated ? '1px solid #9333EA' : '1px solid #333',
      borderRadius: '12px',
      height: '100px',
        cursor: 'pointer',
      transition: 'all 0.2s ease',
        display: 'flex',
      alignItems: 'stretch',
      overflow: 'hidden',
      position: 'relative',
      boxShadow: lpCreated ? '0 0 0 1px rgba(147, 51, 234, 0.2)' : 'none'
      }}
      onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = '#9333EA'
      e.currentTarget.style.background = lpCreated ? '#221138' : '#1a0a2e'
      e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = lpCreated ? '#9333EA' : '#333'
      e.currentTarget.style.background = lpCreated ? '#1a0f2e' : '#111'
      e.currentTarget.style.transform = 'translateY(0)'
    }}
    >
        {/* BONDED Badge */}
        {lpCreated && (
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            padding: '4px 8px',
            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
            borderRadius: '6px',
            fontSize: '10px',
            fontWeight: '700',
            color: '#000',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4), 0 0 12px rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#000"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            BONDED
          </div>
        )}

        {/* Social Links - Top Right */}
        {(twitter || telegram || website) && (
        <div style={{ 
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            gap: '5px',
            zIndex: 10
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {website && (
              <Link 
                href={website.startsWith('http') ? website : `https://${website}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="launchpad-card-social-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '6px',
                  background: 'rgba(147, 51, 234, 0.1)',
                  border: '1px solid rgba(147, 51, 234, 0.3)',
                  color: '#9333EA',
                  textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(147, 51, 234, 0.2)'
                  e.currentTarget.style.borderColor = '#9333EA'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(147, 51, 234, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.3)'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </Link>
            )}
            {twitter && (
              <Link 
                href={twitter.startsWith('http') ? twitter : `https://twitter.com/${twitter.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="launchpad-card-social-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '6px',
                  background: 'rgba(29, 161, 242, 0.1)',
                  border: '1px solid rgba(29, 161, 242, 0.3)',
                  color: '#1DA1F2',
                  textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(29, 161, 242, 0.2)'
                  e.currentTarget.style.borderColor = '#1DA1F2'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(29, 161, 242, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(29, 161, 242, 0.3)'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>
                </svg>
              </Link>
            )}
            {telegram && (
              <Link 
                href={telegram.startsWith('http') ? telegram : `https://t.me/${telegram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="launchpad-card-social-link"
                style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '6px',
                  background: 'rgba(0, 136, 204, 0.1)',
                  border: '1px solid rgba(0, 136, 204, 0.3)',
                  color: '#0088cc',
                  textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 136, 204, 0.2)'
                  e.currentTarget.style.borderColor = '#0088cc'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 136, 204, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(0, 136, 204, 0.3)'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </Link>
            )}
          </div>
        )}

        {/* Logo - Full Height */}
        <div className="launchpad-card-logo" style={{ 
          width: '98px',
          minHeight: '100%',
          flexShrink: 0,
          borderRadius: '8px',
          overflow: 'hidden',
          background: '#1a1a1a',
          display: 'flex',
          alignItems: 'stretch'
        }}>
          <img 
            src={logoUrl} 
            alt={tokenName}
            onError={(e) => {
              e.target.src = '/img/logo.png'
              e.onerror = null
            }}
            style={{ 
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block'
            }} 
          />
        </div>

        {/* Content */}
        <div className="launchpad-card-content" style={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '8px',
          gap: '5px',
          minWidth: 0
        }}>
          {/* Header: Symbol and Name */}
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflow: 'hidden'
          }}>
            <span className="launchpad-card-symbol" style={{
              color: '#fff',
              fontSize: '14px',
              fontWeight: '700',
              whiteSpace: 'nowrap'
            }}>
              ${tokenSymbol}
            </span>
            <span className="launchpad-card-name" style={{
              color: '#999',
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1
            }}>
              {tokenName}
            </span>
          </div>

          {/* Market Cap and Progress with 24h Change */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span className="launchpad-card-mc-label" style={{
              color: '#666',
                  fontSize: '11px',
              fontWeight: '500'
            }}>
              MC
            </span>
            <span className="launchpad-card-mc-value" style={{
              color: '#fff',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              {formatMarketCap(marketCap)}
            </span>
            {/* Progress Bar */}
            <div style={{ flex: 1, minWidth: '100px', maxWidth: '200px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{
                width: '100%',
                height: '4px',
                background: '#222',
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${displayProgress}%`,
                  height: '100%',
                  background: displayProgress >= 80 ? '#10b981' : displayProgress >= 50 ? '#f59e0b' : '#9333EA',
                  transition: 'width 0.3s ease',
                  borderRadius: '2px'
                }} />
              </div>
              {bondingThreshold != null && bondingThreshold > 0 && (
                <span style={{ color: '#888', fontSize: '10px', whiteSpace: 'nowrap' }}>
                  {((progress / 100) * bondingThreshold).toFixed(2)} / {bondingThreshold.toFixed(2)} {isSolana ? 'SOL' : 'ETH'}
                </span>
              )}
            </div>
            {/* 24h Price Change */}
            {(priceChange24h !== null && priceChange24h !== undefined && typeof priceChange24h === 'number') && (
              <span className="launchpad-card-24h-change" style={{
                color: priceChange24h >= 0 ? '#4CAF50' : '#f44336',
                fontSize: '11px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}>
                {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
              </span>
            )}
          </div>

          {/* Footer: Creator and Time */}
          <div className="launchpad-card-footer" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            color: '#666'
          }}>
            {creator && (
              <>
                <img 
                  src={`${imageUrl}profile/${creator?.toLowerCase() || creator}.png`}
                  alt="Creator"
                  onError={(e) => {
                    if (e.target.src !== '/img/logo.png') {
                      e.target.src = '/img/logo.png'
                    }
                  }}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0
                  }}
                />
                <Link 
                  href={`/profile?address=${creator}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ 
                    color: '#666', 
                    textDecoration: 'none',
                    fontFamily: 'monospace',
                    fontSize: '11px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#9333EA'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
                >
                  {creatorUsername || `${creator.slice(0, 6)}...`}
                </Link>
                {createTime > 0 && (
                  <>
                    <span style={{ color: '#444' }}>•</span>
                    <span>{formatCreateTime(createTime)}</span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Description - Single Line */}
            {description && (
              <div style={{ 
              color: '#999',
              fontSize: '11px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: '1.4'
              }}>
                {description}
              </div>
            )}

          {/* Collect Fees Button */}
            {showCollectButton && lpCreated && isOwner && (
              <button
                onClick={handleCollectFees}
                disabled={collectingFees}
                style={{
                padding: '4px 8px',
                  background: collectingFees ? '#333' : '#4CAF50',
                  border: 'none',
                borderRadius: '4px',
                  color: '#fff',
                fontSize: '11px',
                fontWeight: '600',
                  cursor: collectingFees ? 'not-allowed' : 'pointer',
                  opacity: collectingFees ? 0.6 : 1,
                  transition: 'all 0.2s',
                  alignSelf: 'flex-start',
                marginTop: '4px'
                }}
              >
                {collectingFees ? 'Collecting...' : 'Collect Fees'}
              </button>
            )}
          </div>
        </div>
  )

  // If onClick is provided, use a div with that handler
  if (onClick) {
    return (
      <div onClick={onClick} style={{ textDecoration: 'none' }}>
        {cardContent}
      </div>
    )
  }

  // Use a clickable div instead of wrapping in Link, to avoid nested <a> (card contains inner Links for social/profile)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(link)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(link)
        }
      }}
      style={{ textDecoration: 'none', cursor: 'pointer' }}
    >
      {cardContent}
    </div>
  )
})

LaunchpadCard.propTypes = {
  chainId: PropTypes.number.isRequired,
  progress: PropTypes.number.isRequired,
  tokenName: PropTypes.string.isRequired,
  tokenSymbol: PropTypes.string.isRequired,
  logoUrl: PropTypes.string.isRequired,
  bondingCurveAddress: PropTypes.string.isRequired,
  tokenAddress: PropTypes.string,
  marketCap: PropTypes.number.isRequired,
  tokenPrice: PropTypes.number.isRequired,
  ethPrice: PropTypes.number.isRequired,
  depositedAmount: PropTypes.number.isRequired,
  description: PropTypes.string,
  creator: PropTypes.string,
  creatorUsername: PropTypes.string,
  createTime: PropTypes.number,
  lpCreated: PropTypes.bool,
  showCollectButton: PropTypes.bool,
  twitter: PropTypes.string,
  telegram: PropTypes.string,
  website: PropTypes.string,
  priceChange24h: PropTypes.number,
  onClick: PropTypes.func,
  bondingThreshold: PropTypes.number
}

LaunchpadCard.displayName = 'LaunchpadCard'

export default LaunchpadCard