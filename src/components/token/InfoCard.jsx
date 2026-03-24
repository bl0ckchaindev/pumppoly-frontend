'use client'
import React, { useState, useEffect, memo } from 'react'
import PropTypes from 'prop-types'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { readContract } from 'viem/actions'
import { writeContract } from '@wagmi/core'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '../../lib/config.jsx'
import { getEvmPublicClient } from '../../lib/evmRpcClients'
// Copy icon path (served from public folder in Next.js)
const CopyIcon = '/icons/copy.svg'
import { formatTokenAge, formatAddress, calculateTokenPriceUSD, calculateSolanaTokenPriceUSD, calculateMarketCap, calculateVolumeUSD, formatTokenPriceDisplay } from '../../lib/tokenCalculations.ts'
import { apiUrl, imageUrl, web3Clients } from '../../lib/constants.ts'
import { fetchProfile } from '../../lib/supabase.ts'
import { formatMarketCap } from '../../lib/formatting.ts'
import ChadAbi from '../../lib/abis/BondingCurveABI.json'
import './InfoCard.css'
import { useSupabase } from '../../lib/constants'
import Tooltip from '../common/Tooltip'
import BondingCurve101Modal from '../common/BondingCurve101Modal'

const InfoCard = ({
  tokenName,
  tokenSymbol,
  Logo,
  tokenAddress,
  tokenAge,
  description,
  creator,
  creatorUsername: creatorUsernameProp,
  twitter,
  telegram,
  website,
  bondingCurveAddress,
  effectiveChainId,
  chain,
  tokenPrice = 0,
  marketCap = 0,
  volume = 0,
  progress = 0,
  ethPrice = 0,
  priceChange24h = null,
  simplified = false,
  bondingThreshold = null
}) => {
  // Preserve chain in token URL so Solana tokens don't reset to ETH on navigation
  const tokenDetailHref = chain === 'solana' ? `/token/${tokenAddress}?chain=solana` : `/token/${tokenAddress}`
  const [copied, setCopied] = useState(false)
  const [creatorUsername, setCreatorUsername] = useState(creatorUsernameProp || '')
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showDescriptionTooltip, setShowDescriptionTooltip] = useState(false)
  const [showBondingModal, setShowBondingModal] = useState(false)
  const { address, isConnected } = useAccount()

  // Detect mobile device
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
  const [totalOwnerFees, setTotalOwnerFees] = useState('0')
  const [totalLpEthFees, setTotalLpEthFees] = useState('0')
  const [totalLpTokenFees, setTotalLpTokenFees] = useState('0')
  const [bondingCurveOwner, setBondingCurveOwner] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [lpCreated, setLpCreated] = useState(false)
  const [collectingFees, setCollectingFees] = useState(false)
  
  // Check if description is long enough to need truncation
  const descriptionNeedsTruncation = description && description.length > 100
  const displayDescription = descriptionNeedsTruncation && !descriptionExpanded 
    ? description.substring(0, 100) + '...' 
    : description

  const copyAddress = async (address) => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

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

  // Fetch fees, owner, and lpCreated using custom RPC (avoids WalletConnect 429/CORS)
  useEffect(() => {
    const fetchFeesAndOwner = async () => {
      if (!bondingCurveAddress || !effectiveChainId) return

      try {
        const chainIdNum = Number(effectiveChainId)
        const client = getEvmPublicClient(chainIdNum)
        const addr = bondingCurveAddress.startsWith('0x') ? bondingCurveAddress : `0x${bondingCurveAddress}`
        // Read all values in parallel using our custom RPC
        const [totalOwnerFeesResult, totalLpEthFeesResult, totalLpTokenFeesResult, ownerResult, lpCreatedResult] = await Promise.all([
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'totalOwnerFees' }).catch(() => null),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'totalLpEthFees' }).catch(() => null),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'totalLpTokenFees' }).catch(() => null),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'owner' }).catch(() => null),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'lpCreated' }).catch(() => null)
        ])

        if (totalOwnerFeesResult) {
          setTotalOwnerFees(web3Clients[chainIdNum]?.utils?.fromWei?.(totalOwnerFeesResult.toString(), 'ether') || (Number(totalOwnerFeesResult) / 1e18).toString())
        }
        if (totalLpEthFeesResult) {
          setTotalLpEthFees(web3Clients[chainIdNum]?.utils?.fromWei?.(totalLpEthFeesResult.toString(), 'ether') || (Number(totalLpEthFeesResult) / 1e18).toString())
        }
        if (totalLpTokenFeesResult) {
          setTotalLpTokenFees(web3Clients[chainIdNum]?.utils?.fromWei?.(totalLpTokenFeesResult.toString(), 'ether') || totalLpTokenFeesResult.toString())
        }
        if (ownerResult) {
          const owner = ownerResult.toLowerCase()
          setBondingCurveOwner(owner)
          setIsOwner(isConnected && address && address.toLowerCase() === owner)
        }
        if (lpCreatedResult !== null) {
          setLpCreated(!!lpCreatedResult)
        }
      } catch (error) {
        console.error('Error fetching fees and owner:', error)
      }
    }

    fetchFeesAndOwner()
    // Removed polling interval - fees/owner updates come from Supabase real-time subscription via useRealtimeBondingCurve
    // Only fetch once on mount or when dependencies change
  }, [bondingCurveAddress, effectiveChainId, isConnected, address])

  const handleCollectFees = async () => {
    if (!bondingCurveAddress || !effectiveChainId || !isOwner) return

    try {
      setCollectingFees(true)
      const hash = await writeContract(config, {
        address: bondingCurveAddress,
        abi: ChadAbi,
        functionName: 'claimFees',
        chainId: Number(effectiveChainId)
      })
      await waitForTransactionReceipt(config, { hash })
      
      // Refresh fees after collection (use custom RPC)
      const chainIdNum = Number(effectiveChainId)
      const client = getEvmPublicClient(chainIdNum)
      const addr = bondingCurveAddress.startsWith('0x') ? bondingCurveAddress : `0x${bondingCurveAddress}`
      const [totalOwnerFeesResult, totalLpEthFeesResult, totalLpTokenFeesResult] = await Promise.all([
        readContract(client, { address: addr, abi: ChadAbi, functionName: 'totalOwnerFees' }).catch(() => null),
        readContract(client, { address: addr, abi: ChadAbi, functionName: 'totalLpEthFees' }).catch(() => null),
        readContract(client, { address: addr, abi: ChadAbi, functionName: 'totalLpTokenFees' }).catch(() => null)
      ])

      if (totalOwnerFeesResult) {
        setTotalOwnerFees(web3Clients[chainIdNum]?.utils?.fromWei?.(totalOwnerFeesResult.toString(), 'ether') || (Number(totalOwnerFeesResult) / 1e18).toString())
      }
      if (totalLpEthFeesResult) {
        setTotalLpEthFees(web3Clients[chainIdNum]?.utils?.fromWei?.(totalLpEthFeesResult.toString(), 'ether') || (Number(totalLpEthFeesResult) / 1e18).toString())
      }
      if (totalLpTokenFeesResult) {
        setTotalLpTokenFees(web3Clients[chainIdNum]?.utils?.fromWei?.(totalLpTokenFeesResult.toString(), 'ether') || totalLpTokenFeesResult.toString())
      }
    } catch (error) {
      console.error('Error collecting fees:', error)
    } finally {
      setCollectingFees(false)
    }
  }

  // Simplified layout for home page
  if (simplified) {
    const priceUSDStr = chain === 'solana' ? calculateSolanaTokenPriceUSD(tokenPrice, ethPrice) : calculateTokenPriceUSD(tokenPrice, ethPrice)
    const priceDisplay = formatTokenPriceDisplay(priceUSDStr)
    const marketCapFormatted = formatMarketCap(marketCap)
    const volumeFormatted = formatMarketCap(volume)
    const progressPercent = Math.round(progress)
    
    return (
      <div style={{
        background: '#111',
        border: '1px solid #9333EA',
        borderRadius: '12px',
        padding: isMobile ? '16px' : '20px',
        marginBottom: '5px',
        marginTop: isMobile ? '15px' : '5px',
        boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)',
        position: 'relative'
      }}>
        {/* Collect Button - Top Right Corner */}
        {isOwner && lpCreated && (
          <button
            onClick={handleCollectFees}
            disabled={collectingFees}
            style={{
              position: 'absolute',
              top: isMobile ? '12px' : '16px',
              right: isMobile ? '12px' : '16px',
              padding: isMobile ? '6px 12px' : '8px 16px',
              background: collectingFees ? '#333' : '#9333EA',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: isMobile ? '11px' : '12px',
              fontWeight: '600',
              cursor: collectingFees ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              zIndex: 10
            }}
            onMouseEnter={(e) => {
              if (!collectingFees) {
                e.currentTarget.style.background = '#7c2cd8'
              }
            }}
            onMouseLeave={(e) => {
              if (!collectingFees) {
                e.currentTarget.style.background = '#9333EA'
              }
            }}
          >
            {collectingFees ? 'Collecting...' : 'Collect'}
          </button>
        )}

        {/* Header: Icon, Name, Ticker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          {/* Circular Icon */}
          {Logo && (
            <div 
              style={{
                width: isMobile ? '48px' : '56px',
                height: isMobile ? '48px' : '56px',
                borderRadius: '50%',
                border: '1px solid #333',
                background: '#1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'visible',
                position: 'relative',
                cursor: description ? 'help' : 'default'
              }}
              onMouseEnter={() => description && setShowDescriptionTooltip(true)}
              onMouseLeave={() => setShowDescriptionTooltip(false)}
            >
              {React.cloneElement(Logo, {
                style: {
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  ...Logo.props?.style
                }
              })}
              {showDescriptionTooltip && description && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '100%',
                  marginTop: '0',
                  marginLeft: '8px',
                  padding: '10px 12px',
                  background: 'rgba(0, 0, 0, 0.95)',
                  border: '1px solid #9333EA',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                  maxWidth: '250px',
                  width: 'max-content',
                  zIndex: 1000,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(147, 51, 234, 0.3)',
                  pointerEvents: 'none',
                  whiteSpace: 'normal',
                  wordWrap: 'break-word',
                  lineHeight: '1.4'
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#9333EA',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Description
                  </div>
                  <div>{description}</div>
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '100%',
                    width: 0,
                    height: 0,
                    borderTop: '6px solid transparent',
                    borderBottom: '6px solid transparent',
                    borderRight: '6px solid #9333EA'
                  }} />
                </div>
              )}
            </div>
          )}
          
          {/* Name, Social Links, Listed Badge */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <Link
                href={tokenDetailHref}
                style={{
                  fontSize: isMobile ? '18px' : '20px',
                  fontWeight: 'bold',
                  color: '#fff',
                  textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#9333EA'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#fff'
                }}
              >
                {tokenName}
              </Link>
              {/* BONDED Badge */}
              {lpCreated && (
                <span style={{
                  padding: '4px 8px',
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: '700',
                  color: '#000',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4), 0 0 12px rgba(245, 158, 11, 0.2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="#000"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  BONDED
                </span>
              )}
              {/* Social Links */}
              {twitter && (
                <a
                  href={twitter.startsWith('http') ? twitter : `https://twitter.com/${twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(29, 161, 242, 0.1)',
                    border: '1px solid rgba(29, 161, 242, 0.3)',
                    color: '#1DA1F2',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(29, 161, 242, 0.2)'
                    e.currentTarget.style.borderColor = '#1DA1F2'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(29, 161, 242, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(29, 161, 242, 0.3)'
                  }}
                  title="X (Twitter)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              )}
              {website && (
                <a
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(147, 51, 234, 0.1)',
                    border: '1px solid rgba(147, 51, 234, 0.3)',
                    color: '#9333EA',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(147, 51, 234, 0.2)'
                    e.currentTarget.style.borderColor = '#9333EA'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(147, 51, 234, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.3)'
                  }}
                  title="Website"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              )}
              {telegram && (
                <a
                  href={telegram.startsWith('http') ? telegram : `https://t.me/${telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(0, 136, 204, 0.1)',
                    border: '1px solid rgba(0, 136, 204, 0.3)',
                    color: '#0088cc',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 136, 204, 0.2)'
                    e.currentTarget.style.borderColor = '#0088cc'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 136, 204, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(0, 136, 204, 0.3)'
                  }}
                  title="Telegram"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                </a>
              )}
            </div>
            {/* Ticker and Token Address */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{
                fontSize: isMobile ? '14px' : '16px',
                color: '#999',
                fontWeight: 'normal'
              }}>
                [{tokenSymbol}]
              </div>
              <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#999' }}>
                {formatAddress(tokenAddress)}
              </span>
              <button 
                onClick={() => copyAddress(tokenAddress)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  padding: '4px', 
                  display: 'flex', 
                  alignItems: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.7'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
                title="Copy address"
              >
                <img src={CopyIcon} alt="Copy" width={14} height={14} style={{ opacity: copied ? 0.5 : 1 }} />
              </button>
              {copied && (
                <span style={{ fontSize: '11px', color: '#4CAF50' }}>Copied!</span>
              )}
            </div>
          </div>
        </div>

        {/* Metrics Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: isMobile ? '8px' : '12px',
          marginBottom: '16px'
        }}>
          <div className='text-center'>
            <Tooltip text="Current token price in USD, calculated from the bonding curve.">
              <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>PRICE <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
            </Tooltip>
            <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 'bold', color: '#fff' }}>${priceDisplay}</div>
          </div>
          <div className='text-center'>
            <Tooltip text="Total value of all tokens if sold at current price.">
              <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>MARKET CAP <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
            </Tooltip>
            <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 'bold', color: '#fff' }}>{marketCapFormatted}</div>
          </div>
          <div className='text-center'>
            <Tooltip text="Total trading volume in USD.">
              <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>VOLUME <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
            </Tooltip>
            <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 'bold', color: '#fff' }}>{volumeFormatted}</div>
          </div>
          <div className='text-center'>
            <Tooltip text="How close the bonding curve is to completion. At 100%, liquidity moves to a DEX.">
              <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>PROGRESS <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
            </Tooltip>
            <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 'bold', color: '#fff' }}>{progressPercent}%</div>
            {bondingThreshold != null && bondingThreshold > 0 && (
              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                {((progress / 100) * bondingThreshold).toFixed(4)} / {bondingThreshold.toFixed(4)} {chain === 'solana' ? 'SOL' : 'ETH'}
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Launch Progress
            <button
              onClick={() => setShowBondingModal(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                display: 'inline-flex',
                alignItems: 'center',
                color: '#9333EA',
                transition: 'opacity 0.2s',
              }}
              title="Learn how the bonding curve works"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </button>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#222',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: progressPercent >= 80 ? '#10b981' : progressPercent >= 50 ? '#f59e0b' : '#9333EA',
              transition: 'width 0.3s ease'
            }} />
          </div>
          {bondingThreshold != null && bondingThreshold > 0 && (
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
              {(progress / 100 * bondingThreshold).toFixed(4)} / {bondingThreshold.toFixed(4)} {chain === 'solana' ? 'SOL' : 'ETH'} threshold
            </div>
          )}
        </div>

        {/* Fair launch banner (bonding phase only) */}
        {!lpCreated && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: 'rgba(147, 51, 234, 0.06)',
            border: '1px solid rgba(147, 51, 234, 0.2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9333EA" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span style={{ color: '#999', fontSize: '11px', lineHeight: '1.4' }}>
              Fair launch — no presale, no insider allocation. Creator cap at 15%.
            </span>
          </div>
        )}

        <BondingCurve101Modal isOpen={showBondingModal} onClose={() => setShowBondingModal(false)} />
      </div>
    )
  }

  return (
    <div className="info-card-container">
      <div className="info-card-main">
        {/* Mobile Layout: Logo, Name, Ticker, Copy Button in one row */}
        {isMobile ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            width: '100%',
            // marginBottom: '12px',
            position: 'relative'
          }}>
            {/* Smaller Logo */}
            {Logo && (
              <div 
                style={{ 
                  flexShrink: 0,
                  width: '40px',
                  height: '40px',
                  position: 'relative',
                  cursor: description ? 'help' : 'default'
                }}
                onMouseEnter={() => description && setShowDescriptionTooltip(true)}
                onMouseLeave={() => setShowDescriptionTooltip(false)}
              >
                {React.cloneElement(Logo, {
                  style: { 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '50%',
                    objectFit: 'cover',
                    ...Logo.props?.style 
                  }
                })}
                {showDescriptionTooltip && description && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '100%',
                    marginTop: '0',
                    marginLeft: '8px',
                    padding: '10px 12px',
                    background: 'rgba(0, 0, 0, 0.95)',
                    border: '1px solid #9333EA',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    maxWidth: '250px',
                    width: 'max-content',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(147, 51, 234, 0.3)',
                    pointerEvents: 'none',
                    whiteSpace: 'normal',
                    wordWrap: 'break-word',
                    lineHeight: '1.4'
                  }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#9333EA',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Description
                    </div>
                    <div>{description}</div>
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '100%',
                      width: 0,
                      height: 0,
                      borderTop: '6px solid transparent',
                      borderBottom: '6px solid transparent',
                      borderRight: '6px solid #9333EA'
                    }} />
                  </div>
                )}
              </div>
            )}
            
            {/* Name, Ticker, and Copy Button */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ 
                  color: '#fff', 
                  margin: 0, 
                  fontSize: '16px', 
                  fontWeight: '700'
                }}>
                  {tokenName}
                </h3>
                <span style={{ 
                  color: '#fff', 
                  fontSize: '14px', 
                  fontWeight: '700' 
                }}>
                  ${tokenSymbol}
                </span>
                {/* Copy Address Button next to symbol */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button 
                    onClick={() => copyAddress(tokenAddress)}
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.1)', 
                      border: '1px solid rgba(255, 255, 255, 0.2)', 
                      borderRadius: '6px',
                      cursor: 'pointer', 
                      padding: '6px', 
                      display: 'flex', 
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                    }}
                    title="Copy address"
                  >
                    <img src={CopyIcon} alt="Copy" width={14} height={14} style={{ opacity: copied ? 0.5 : 1 }} />
                  </button>
                  {copied && (
                    <span style={{ 
                      fontSize: '11px', 
                      color: '#4CAF50',
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      background: 'rgba(76, 175, 80, 0.2)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                      zIndex: 10
                    }}>
                      Copied!
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Layout: Logo on left side */}
            {Logo && (
              <div style={{ flexShrink: 0, width: '60px', height: '60px' }}>
                {Logo}
              </div>
            )}
          </>
        )}
        
        {/* Content wrapper for content and fees */}
        <div className="info-card-content-wrapper">
          {/* Content in middle */}
          <div className="info-card-content">
          {/* Top: Token name and social links (left aligned) - Desktop only */}
          {!isMobile && (
            <div style={{ marginBottom: '8px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '16px', fontWeight: '700', textAlign: 'left' }}>{tokenName}</h3>
                {/* BONDED Badge */}
                {lpCreated && (
                  <span style={{
                    padding: '4px 8px',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: '700',
                    color: '#000',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4), 0 0 12px rgba(245, 158, 11, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#000"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    BONDED
                  </span>
                )}
                {/* Social Links - icons only */}
                {twitter && (
                <a
                  href={twitter.startsWith('http') ? twitter : `https://twitter.com/${twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(29, 161, 242, 0.1)',
                    border: '1px solid rgba(29, 161, 242, 0.3)',
                    color: '#1DA1F2',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(29, 161, 242, 0.2)'
                    e.currentTarget.style.borderColor = '#1DA1F2'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(29, 161, 242, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(29, 161, 242, 0.3)'
                  }}
                  title="X (Twitter)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              )}
              {website && (
                <a
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(147, 51, 234, 0.1)',
                    border: '1px solid rgba(147, 51, 234, 0.3)',
                    color: '#9333EA',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(147, 51, 234, 0.2)'
                    e.currentTarget.style.borderColor = '#9333EA'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(147, 51, 234, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.3)'
                  }}
                  title="Website"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              )}
              {telegram && (
                <a
                  href={telegram.startsWith('http') ? telegram : `https://t.me/${telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(0, 136, 204, 0.1)',
                    border: '1px solid rgba(0, 136, 204, 0.3)',
                    color: '#0088cc',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 136, 204, 0.2)'
                    e.currentTarget.style.borderColor = '#0088cc'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 136, 204, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(0, 136, 204, 0.3)'
                  }}
                  title="Telegram"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                </a>
              )}
              </div>
            </div>
          )}

          {/* Desktop: Token Ticker and copyable token address inline */}
          {!isMobile && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginBottom: '8px',
              flexWrap: 'wrap' 
            }}>
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: '700' }}>${tokenSymbol}</span>
              <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#999' }}>
                {formatAddress(tokenAddress)}
              </span>
              <button 
                onClick={() => copyAddress(tokenAddress)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  padding: '4px', 
                  display: 'flex', 
                  alignItems: 'center' 
                }}
              >
                <img src={CopyIcon} alt="Copy" width={14} height={14} />
              </button>
              {copied && <span style={{ fontSize: '12px', color: '#4CAF50' }}>Copied!</span>}
            </div>
          )}

          {/* Mobile: Listed Badge and Social Links */}
          {isMobile && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginBottom: '8px',
              flexWrap: 'wrap' 
            }}>
              {/* BONDED Badge */}
              {lpCreated && (
                <span style={{
                  padding: '4px 8px',
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: '700',
                  color: '#000',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4), 0 0 12px rgba(245, 158, 11, 0.2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="#000"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  BONDED
                </span>
              )}
              {/* Social Links - icons only */}
              {twitter && (
                <a
                  href={twitter.startsWith('http') ? twitter : `https://twitter.com/${twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(29, 161, 242, 0.1)',
                    border: '1px solid rgba(29, 161, 242, 0.3)',
                    color: '#1DA1F2',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(29, 161, 242, 0.2)'
                    e.currentTarget.style.borderColor = '#1DA1F2'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(29, 161, 242, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(29, 161, 242, 0.3)'
                  }}
                  title="X (Twitter)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              )}
              {website && (
                <a
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(147, 51, 234, 0.1)',
                    border: '1px solid rgba(147, 51, 234, 0.3)',
                    color: '#9333EA',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(147, 51, 234, 0.2)'
                    e.currentTarget.style.borderColor = '#9333EA'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(147, 51, 234, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.3)'
                  }}
                  title="Website"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              )}
              {telegram && (
                <a
                  href={telegram.startsWith('http') ? telegram : `https://t.me/${telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: 'rgba(0, 136, 204, 0.1)',
                    border: '1px solid rgba(0, 136, 204, 0.3)',
                    color: '#0088cc',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 136, 204, 0.2)'
                    e.currentTarget.style.borderColor = '#0088cc'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 136, 204, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(0, 136, 204, 0.3)'
                  }}
                  title="Telegram"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                </a>
              )}
            </div>
          )}

          {/* Stats: Price, Market Cap, Volume, Progress */}
          {(tokenPrice > 0 || marketCap > 0 || volume > 0 || progress >= 0) && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              marginBottom: '8px',
              flexWrap: 'wrap',
              fontSize: '12px'
            }}>
              {tokenPrice > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Tooltip text="Current token price in USD, calculated from the bonding curve."><span style={{ color: '#666' }}>Price:</span></Tooltip>
                  <span style={{ color: '#fff', fontWeight: '600' }}>
                    ${formatTokenPriceDisplay(chain === 'solana' ? calculateSolanaTokenPriceUSD(tokenPrice, ethPrice) : calculateTokenPriceUSD(tokenPrice, ethPrice))}
                  </span>
                  {(priceChange24h !== null && priceChange24h !== undefined && typeof priceChange24h === 'number') && (
                    <span style={{
                      color: priceChange24h >= 0 ? '#4CAF50' : '#f44336',
                      fontSize: '11px',
                      fontWeight: '600',
                      marginLeft: '4px'
                    }}>
                      ({priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%)
                    </span>
                  )}
                </div>
              )}
              {marketCap > 0 && (
                <>
                  <span style={{ color: '#444' }}>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Tooltip text="Total value of all tokens if sold at current price."><span style={{ color: '#666' }}>MC:</span></Tooltip>
                    <span style={{ color: '#fff', fontWeight: '600' }}>
                      {formatMarketCap(marketCap)}
                    </span>
                  </div>
                </>
              )}
              {volume > 0 && (
                <>
                  <span style={{ color: '#444' }}>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Tooltip text="Total trading volume in USD."><span style={{ color: '#666' }}>Vol:</span></Tooltip>
                    <span style={{ color: '#fff', fontWeight: '600' }}>
                      {formatMarketCap(volume)}
                    </span>
                  </div>
                </>
              )}
              {progress >= 0 && (
                <>
                  <span style={{ color: '#444' }}>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '100px', maxWidth: '200px' }}>
                    <Tooltip text="How close the bonding curve is to completion. At 100%, liquidity moves to a DEX.">
                      <span style={{ color: '#666', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Progress
                        <button onClick={() => setShowBondingModal(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', color: '#9333EA' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                        </button>
                      :</span>
                    </Tooltip>
                    <div style={{
                      flex: 1,
                      height: '4px',
                      background: '#222',
                      borderRadius: '2px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${Math.min(progress, 100)}%`,
                        height: '100%',
                        background: progress >= 80 ? '#10b981' : progress >= 50 ? '#f59e0b' : '#9333EA',
                        transition: 'width 0.3s ease',
                        borderRadius: '2px'
                      }} />
                    </div>
                    <span style={{ color: '#fff', fontSize: '12px', fontWeight: '600', minWidth: '35px' }}>
                      {progress.toFixed(1)}%
                    </span>
                    {bondingThreshold != null && bondingThreshold > 0 && (
                      <span style={{ color: '#888', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        ({((progress / 100) * bondingThreshold).toFixed(2)} / {bondingThreshold.toFixed(2)} {chain === 'solana' ? 'SOL' : 'ETH'})
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bottom: Creator avatar, creator name, token age inline */}
          {(creator || tokenAge !== undefined) && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '5px',
              flexWrap: 'wrap',
              fontSize: '12px',
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
                    style={{ 
                      color: '#666', 
                      textDecoration: 'none',
                      fontSize: '12px',
                      fontFamily: 'monospace'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#9333EA'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
                  >
                    {creatorUsername || `${creator.slice(0, 6)}...`}
                  </Link>
                </>
              )}
              {tokenAge !== undefined && (
                <>
                  {creator && <span style={{ color: '#444' }}>•</span>}
                  <span style={{ color: '#666', fontSize: '12px' }}>
                    {formatTokenAge(tokenAge)}
                  </span>
                </>
              )}
              {/* Mobile: Show Owner Fees Paid next to token age (EVM only) */}
              {isMobile && bondingCurveAddress && chain !== 'solana' && (
                <>
                  <span style={{ color: '#444' }}>•</span>
                  <span style={{ color: '#666', fontSize: '12px' }}>
                    Owner Fees: {parseFloat(totalOwnerFees).toFixed(4)} {effectiveChainId === '8453' ? 'ETH' : 'ETH'}
                  </span>
                  {/* Mobile: Collect Fees Button - only show if lpCreated is true and user is owner */}
                  {lpCreated && isOwner && (
                    <button
                      onClick={handleCollectFees}
                      disabled={collectingFees}
                      style={{
                        marginLeft: '8px',
                        padding: '4px 8px',
                        background: collectingFees ? '#333' : '#4CAF50',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: '600',
                        cursor: collectingFees ? 'not-allowed' : 'pointer',
                        opacity: collectingFees ? 0.6 : 1,
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {collectingFees ? 'Collecting...' : 'Collect'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          </div>

          {/* Fees Section - Right side (Desktop only, EVM only) */}
          {bondingCurveAddress && !isMobile && chain !== 'solana' && (
            <div className="info-card-fees info-card-fees-mobile">
            <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Owner Fees Paid</div>
                <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                  {parseFloat(totalOwnerFees).toFixed(4)} ETH
                </div>
              </div>
              {/* Only show LP fees if lpCreated is true */}
              {lpCreated && (
                <>
                  <div>
                    <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>LP ETH Fees</div>
                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                      {parseFloat(totalLpEthFees).toFixed(4)} ETH
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>LP Token Fees</div>
                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                      {parseFloat(totalLpTokenFees).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Collect Fees Button - only show if lpCreated is true and user is owner */}
            {lpCreated && isOwner && (
              <button
                onClick={handleCollectFees}
                disabled={collectingFees}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: collectingFees ? '#333' : '#4CAF50',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: collectingFees ? 'not-allowed' : 'pointer',
                  opacity: collectingFees ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
              >
                {collectingFees ? 'Collecting...' : 'Collect Fees'}
              </button>
            )}
            </div>
          )}
        </div>

        {/* Description Section */}
        {description && (
          <div className="info-card-description-section">
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: '6px',
            color: '#999', 
            fontSize: '12px', 
            lineHeight: '1.4',
            width: '100%',
            minWidth: 0,
            maxWidth: '100%',
            overflow: 'hidden'
          }}>
            <p style={{ 
              margin: 0, 
              flex: 1,
              minWidth: 0,
              maxWidth: '100%',
              whiteSpace: descriptionExpanded ? 'normal' : 'nowrap',
              overflow: 'hidden',
              textOverflow: descriptionExpanded ? 'clip' : 'ellipsis',
              wordWrap: 'break-word',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              boxSizing: 'border-box'
            }}>
              {displayDescription}
            </p>
            {descriptionNeedsTruncation && (
              <button
                onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#9333EA',
                  flexShrink: 0,
                  transition: 'transform 0.2s',
                  position: 'relative',
                  zIndex: 1
                }}
                title={descriptionExpanded ? 'Show less' : 'Show more'}
              >
                <svg 
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  style={{
                    transform: descriptionExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                  }}
                >
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        )}
        <BondingCurve101Modal isOpen={showBondingModal} onClose={() => setShowBondingModal(false)} />
      </div>
    </div>
  )
}

InfoCard.propTypes = {
  tokenName: PropTypes.string.isRequired,
  tokenSymbol: PropTypes.string.isRequired,
  Logo: PropTypes.element.isRequired,
  tokenAddress: PropTypes.string.isRequired,
  tokenAge: PropTypes.number,
  description: PropTypes.string,
  creator: PropTypes.string,
  creatorUsername: PropTypes.string,
  twitter: PropTypes.string,
  telegram: PropTypes.string,
  website: PropTypes.string,
  bondingCurveAddress: PropTypes.string,
  effectiveChainId: PropTypes.string,
  chain: PropTypes.string,
  tokenPrice: PropTypes.number,
  marketCap: PropTypes.number,
  volume: PropTypes.number,
  progress: PropTypes.number,
  ethPrice: PropTypes.number,
  priceChange24h: PropTypes.number,
  bondingThreshold: PropTypes.number
}

export default memo(InfoCard)