'use client'
import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import Link from 'next/link'
import { scanLinks, web3Clients, CHAIN_ID, imageUrl } from '../../lib/constants.ts'
import { 
  fetchTradeHistory, 
  subscribeToTrades, 
  supabase,
  fetchProfile
} from '../../lib/supabase.ts'
import { formatNumberWithSuffix, formatTradeDate, formatTradeDateFull } from '../../lib/formatting.ts'
import './TradingHistory.css'

import { useSupabase } from '../../lib/constants'

// Helper to detect Solana address (base58 vs hex)
const isSolanaAddress = (address) => {
  if (!address) return false
  return !String(address).startsWith('0x')
}

const TradingHistory = ({ tokenAddress, chainId, contractAddress, tokenPriceDatas, ethPrice, tokenSymbol, showHeader = true, simplified = false, chain, maxRows, onViewAll, refreshKey }) => {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [visibleItems, setVisibleItems] = useState(maxRows != null ? Math.min(maxRows, 8) : 8)
  const [usernames, setUsernames] = useState({})
  const [showFullDate, setShowFullDate] = useState(false)
  const subscriptionRef = useRef(null)
  const scrollContainerRef = useRef(null)

  // Detect chain type - use prop if provided, otherwise detect from address
  const isSolana = chain === 'solana' || (chain === undefined && isSolanaAddress(tokenAddress))
  const nativeCurrencySymbol = isSolana ? 'SOL' : 'ETH'

  // Normalize chainId to number and get scan link with fallback
  const normalizedChainId = chainId ? Number(chainId) : CHAIN_ID
  // Use Solana explorer for Solana tokens (with devnet cluster)
  const scanLink = isSolana 
    ? 'https://solscan.io/' 
    : (scanLinks[normalizedChainId] || scanLinks[CHAIN_ID] || 'https://basescan.org/')
  // For Solana, append cluster=devnet to transaction URLs
  const getTxUrl = (txHash) => {
    if (isSolana) {
      return `https://solscan.io/tx/${txHash}?cluster=devnet`
    }
    return `${scanLink}tx/${txHash}`
  }

  // Fetch username for an account address
  const fetchUsername = useCallback(async (accountAddress) => {
    if (!useSupabase || !accountAddress) return
    
    try {
      const profileData = await fetchProfile(accountAddress)
      if (profileData && profileData.length > 0) {
        const profile = profileData[0]
        const username = profile.username || profile.name
        if (username) {
          setUsernames(prev => ({ ...prev, [accountAddress.toLowerCase()]: username }))
        }
      }
    } catch (error) {
      console.error('Error fetching username for', accountAddress, error)
    }
  }, [])

  // Format trade data for display (chain-aware: Solana uses lamports/1e9 and token base units; EVM uses wei/1e18)
  const formatTrade = useCallback((trade, ethPrice, tokenSymbol) => {
    try {
      let amountEth = 0
      let amountToken = 0

      if (isSolana) {
        // Solana: eth_amount (quoteAmount) is in lamports → divide by 1e9 for SOL
        amountEth = Number(trade.eth_amount || '0') / 1e9
        // Solana: token_amount (baseAmount) is in token base units (typically 9 decimals for SPL)
        amountToken = Number(trade.token_amount || '0') / 1e9
      } else {
        // EVM: amounts are in wei (18 decimals)
        if (web3Clients[chainId]?.utils?.fromWei) {
          amountEth = Number(web3Clients[chainId].utils.fromWei(trade.eth_amount || '0', 'ether') || '0')
          amountToken = Number(web3Clients[chainId].utils.fromWei((trade.token_amount || '0').toString(), 'ether') || '0')
        } else {
          amountEth = Number(trade.eth_amount || '0') / 1e18
          amountToken = Number(trade.token_amount || '0') / 1e18
        }
      }

      const accountAddress = trade.trader || ''
      const accountLower = accountAddress.toLowerCase()
      // Use stable URL without cache-busting to prevent excessive requests
      const avatarUrl = `${imageUrl}profile/${accountLower}.png`

      return {
        Account: accountAddress,
        Type: trade.is_buy ? 'Buy' : 'Sell',
        EthAmount: formatNumberWithSuffix(amountEth),
        TokenAmount: formatNumberWithSuffix(amountToken),
        timestamp: trade.timestamp || 0,
        Transaction: trade.transaction_hash || '',
        avatar: avatarUrl,
        username: usernames[accountLower] || null
      }
    } catch (error) {
      console.error('Error formatting trade:', error, trade)
      return null
    }
  }, [usernames, isSolana, chainId])

  // Fetch trades from Supabase; refetch when refreshKey changes (e.g. after buy/sell)
  useEffect(() => {
    if (!tokenAddress) {
      console.log('TradingHistory: No tokenAddress provided')
      setLoading(false)
      return
    }

    if (!useSupabase) {
      console.warn('TradingHistory: Supabase not configured')
      setLoading(false)
      return
    }

    const loadTrades = async () => {
      try {
        setLoading(true)
        console.log('TradingHistory: Fetching trades for token:', tokenAddress)
        const tradeData = await fetchTradeHistory(tokenAddress, 100)
        console.log('TradingHistory: Fetched trades:', tradeData?.length || 0, 'trades')
        if (tradeData && tradeData.length > 0) {
          console.log('TradingHistory: Sample trade:', tradeData[0])
          
          // Fetch usernames for all unique traders (don't wait for this)
          const uniqueTraders = [...new Set(tradeData.map(trade => trade.trader?.toLowerCase()).filter(Boolean))]
          uniqueTraders.forEach(trader => {
            const traderAddress = tradeData.find(t => t.trader?.toLowerCase() === trader)?.trader
            if (traderAddress) {
              fetchUsername(traderAddress)
            }
          })
        }
        setTrades(tradeData || [])
      } catch (error) {
        console.error('TradingHistory: Error fetching trades:', error)
        setTrades([])
      } finally {
        setLoading(false)
      }
    }

    loadTrades()

    // When refreshKey is set (e.g. after buy/sell), refetch again after a delay so backend-inserted trade is included
    let delayedRefetchTimer = null
    if (refreshKey != null && refreshKey > 0) {
      delayedRefetchTimer = setTimeout(() => {
        loadTrades()
      }, 3000)
    }

    // Subscribe to real-time trade updates (address normalized inside subscribeToTrades for DB match)
    subscriptionRef.current = subscribeToTrades(tokenAddress, (newTrade) => {
      console.log('TradingHistory: New trade received:', newTrade)
      setTrades(prev => {
        // Check if trade already exists
        const exists = prev.some(t => t.transaction_hash === newTrade.transaction_hash)
        if (exists) return prev
        // Add new trade at the beginning
        return [newTrade, ...prev].slice(0, 100)
      })
    })

    return () => {
      if (delayedRefetchTimer) clearTimeout(delayedRefetchTimer)
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
      }
    }
  }, [tokenAddress, fetchUsername, refreshKey])

  // Refresh avatars only when new trades arrive (not on a timer to avoid excessive requests)
  // Removed automatic refresh interval to prevent 429 errors

  // Format trades for display - update when usernames or avatar refresh key changes
  const formattedTrades = React.useMemo(() => {
    return trades
      .map(trade => formatTrade(trade, ethPrice || 0, tokenSymbol))
      .filter(trade => {
      if (!trade) {
        console.log('TradingHistory: Filtered out null trade')
        return false
      }
      // Show all trades - even with 0 amounts for debugging
      // In production, you might want to filter out 0 amount trades
      const hasValidData = trade.Account && trade.Transaction
      if (!hasValidData) {
        console.log('TradingHistory: Filtered out trade with missing data:', trade)
      }
      return hasValidData
    })
  }, [trades, formatTrade, ethPrice, tokenSymbol])

  // Get visible trades for infinite scroll
  const visibleTrades = formattedTrades.slice(0, visibleItems)
  const hasMore = visibleItems < formattedTrades.length

  // Handle scroll to load more
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current) return
      
      const container = scrollContainerRef.current
      const scrollTop = container.scrollTop
      const scrollHeight = container.scrollHeight
      const clientHeight = container.clientHeight
      
      // Load more when scrolled to within 100px of bottom
      if (scrollHeight - scrollTop - clientHeight < 100 && hasMore) {
        setVisibleItems(prev => Math.min(prev + 8, formattedTrades.length))
      }
    }

    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, formattedTrades.length])

  // Scroll to top function
  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (loading) {
    return (
      <div>
        <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>Loading...</div>
      </div>
    )
  }

  // Simplified layout for home page
  if (simplified) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          fontSize: '14px', 
          color: '#999', 
          textTransform: 'uppercase', 
          marginBottom: '12px',
          fontWeight: '600'
        }}>
          RECENT TRADES
        </div>
        <div style={{ 
          flex: 1, 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
        className="trading-history-scroll"
        >
          {formattedTrades.length === 0 ? (
            <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
              No trading history available
            </div>
          ) : (
            formattedTrades.slice(0, maxRows ?? 10).map((item, index) => {
              const txUrl = getTxUrl(item.Transaction)
              const timeAgo = formatTradeDate(item.timestamp)
              return (
                <div
                  key={item.Transaction || index}
                  onClick={() => window.open(txUrl, '_blank')}
                  style={{
                    background: '#1a1a1a',
                    borderRadius: '8px',
                    padding: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: '1px solid #333'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#222'
                    e.currentTarget.style.borderColor = '#444'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#1a1a1a'
                    e.currentTarget.style.borderColor = '#333'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <div>
                      <div style={{ 
                        color: item.Type === 'Buy' ? '#4CAF50' : '#f44336',
                        fontSize: '14px',
                        fontWeight: '600',
                        marginBottom: '4px'
                      }}>
                        {item.Type} {item.EthAmount} {nativeCurrencySymbol}
                      </div>
                    </div>
                    <div style={{ color: '#999', fontSize: '12px', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                      {timeAgo}
                    </div>
                  </div>
                  <div style={{ color: '#999', fontSize: '13px', wordBreak: 'break-word' }}>
                    {item.TokenAmount} {tokenSymbol}
                  </div>
                </div>
              )
            })
          )}
          {maxRows != null && onViewAll && formattedTrades.length > maxRows && (
            <button
              type="button"
              onClick={onViewAll}
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                width: '100%',
                background: 'transparent',
                border: '1px solid #9333EA',
                borderRadius: '8px',
                color: '#9333EA',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              View all trades
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>      
      {formattedTrades.length === 0 ? (
        <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
          No trading history available
          {trades.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              (Found {trades.length} trades in database, but none passed the filter. Check console for details.)
            </div>
          )}
          {!useSupabase && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              Supabase is not configured. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY
            </div>
          )}
        </div>
      ) : (
        <>
          <div 
            ref={scrollContainerRef}
            style={{ 
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: '600px',
              scrollbarWidth: 'none', /* Firefox */
              msOverflowStyle: 'none', /* IE and Edge */
            }}
            className="trading-history-scroll"
          >
            {showHeader && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.8fr 1.5fr 1.5fr 1fr 1.5fr', gap: '10px', padding: '5px 0', borderBottom: '1px solid #333', marginBottom: '10px' }}>
              <div style={{ color: '#999', fontSize: '14px' }}>Account</div>
              <div style={{ color: '#999', fontSize: '14px' }}>Type</div>
              <div style={{ color: '#999', fontSize: '14px', textAlign: 'left' }}>Amount ({nativeCurrencySymbol})</div>
              <div style={{ color: '#999', fontSize: '14px', textAlign: 'left' }}>Amount ({tokenSymbol})</div>
              <div style={{ color: '#999', fontSize: '14px', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', cursor: 'pointer' }} onClick={() => setShowFullDate(!showFullDate)}>
                Date
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  style={{ opacity: 0.7 }}
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div style={{ color: '#999', fontSize: '14px', textAlign: 'right' }}>Transaction</div>
            </div>
            )}
            {visibleTrades.map((item, index) => (
              <div key={item.Transaction || index} style={{ 
                display: 'grid', 
                gridTemplateColumns: '1.5fr 0.8fr 1.5fr 1.5fr 1fr 1.5fr', 
                gap: '8px', 
                padding: '6px 8px',
                borderBottom: '1px solid #333',
                marginBottom: '2px',
                alignItems: 'center'
              }}>
                <div>
                  <Link
                    href={`/profile?address=${item.Account}`}
                    style={{ 
                      color: '#9333EA', 
                      fontSize: '13px',
                      fontWeight: 'bold',
                      textDecoration: 'none', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px' 
                    }}
                  >
                    <img
                      src={item.avatar}
                      alt="avatar"
                      onError={(e) => {
                        e.target.src = '/img/logo.png'
                        e.onerror = null
                      }}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '1px solid #333',
                        flexShrink: 0
                      }}
                    />
                    <span>
                        {item.username || item.Account.slice(0, 6) + '...' + item.Account.slice(-4)}
                      </span>
                  </Link>
                </div>
                <div>
                  <span style={{
                    color: item.Type === 'Buy' ? '#4CAF50' : '#f44336',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    textShadow: item.Type === 'Buy' 
                      ? '0 0 8px rgba(76, 175, 80, 0.8)' 
                      : '0 0 8px rgba(244, 67, 54, 0.8)'
                  }}>
                    {item.Type}
                  </span>
                </div>
                <div style={{ textAlign: 'left', color: '#fff', fontSize: '14px' }}>
                  {item.EthAmount}
                </div>
                <div style={{ textAlign: 'left', color: '#fff', fontSize: '14px' }}>
                  {item.TokenAmount}
                </div>
                <div style={{ textAlign: 'right', color: '#999', fontSize: '12px' }}>
                  {showFullDate ? formatTradeDateFull(item.timestamp) : formatTradeDate(item.timestamp)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <a
                    href={getTxUrl(item.Transaction)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ 
                      fontSize: '14px', 
                      textDecoration: 'none', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '4px', 
                      justifyContent: 'flex-end',
                      color: '#9333EA',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.textShadow = '0 0 10px rgba(147, 51, 234, 0.8)'
                      e.currentTarget.style.color = '#A855F7'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.textShadow = 'none'
                      e.currentTarget.style.color = '#9333EA'
                    }}
                  >
                    {item.Transaction.slice(0, 6) + '...' + item.Transaction.slice(-4)}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px rgba(147, 51, 234, 0.8))' }}>
                      <path d="M15 3h6v6"></path>
                      <path d="M10 14 21 3"></path>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    </svg>
                  </a>
                </div>
              </div>
            ))}
            {hasMore && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '14px' }}>
                Scroll down to load more...
              </div>
            )}
          </div>
          
          {visibleItems >= 20 && (
            <button
              onClick={scrollToTop}
              style={{
                position: 'sticky',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '12px 20px',
                background: '#9333ea',
                border: '1px solid #A855F7',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '20px',
                boxShadow: 
                  '0 0 15px rgba(147, 51, 234, 0.8), 0 0 30px rgba(147, 51, 234, 0.6), 0 4px 12px rgba(147, 51, 234, 0.4)',
                zIndex: 100,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = 
                  '0 0 20px rgba(147, 51, 234, 1), 0 0 40px rgba(147, 51, 234, 0.8), 0 4px 12px rgba(147, 51, 234, 0.6)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 
                  '0 0 15px rgba(147, 51, 234, 0.8), 0 0 30px rgba(147, 51, 234, 0.6), 0 4px 12px rgba(147, 51, 234, 0.4)'
              }}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M18 15l-6-6-6 6"></path>
              </svg>
              Go to Top
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default memo(TradingHistory)
