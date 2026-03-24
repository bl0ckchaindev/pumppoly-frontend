'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import LaunchpadCard from '../../components/token/LaunchpadCard.jsx'
import Footer from '../../components/common/Footer.jsx'
import TopBar from '../../components/common/TopBar.jsx'
import LoadingSpinner from '../../components/common/LoadingSpinner.jsx'
import EmptyState from '../../components/common/EmptyState.jsx'
import { useAllTokens } from '../../lib/hooks/useAllTokens'
import { useEthPrice } from '../../lib/hooks/useEthPrice'
import { useSolPrice } from '../../lib/hooks/useSolPrice'
import { useChain } from '../../lib/context/ChainContext'
import { formatNumber, calculateTokenPriceUSD, calculateMarketCap, calculateVolumeUSD } from '../../lib/tokenCalculations'
import { formatMarketCap, formatCreateTime, formatNumberWithSuffix } from '../../lib/formatting'
import { colors, spacing, fontSize, borderRadius } from '../../lib/styles'
import { apiUrl, imageUrl } from '../../lib/constants'
// CSS converted to Tailwind

// Trending Card Component
const TrendingCard = ({ token, link }) => {
  // Use actual 24h price change if available
  const priceChange24h = token.priceChange24h !== null && token.priceChange24h !== undefined ? token.priceChange24h : null
  const percentageChange = priceChange24h !== null ? priceChange24h.toFixed(2) : '0.00'
  const isPositive = priceChange24h !== null ? priceChange24h >= 0 : true
  const firstLetter = token.tokenSymbol?.charAt(0).toUpperCase() || '?'

  return (
    <Link href={link} className="no-underline flex-shrink-0">
      <div className="flex items-center gap-2.5 bg-[#1a0a2e] border border-purple-primary rounded-[50px] px-1.5 py-0.5 cursor-pointer transition-all duration-200 flex-shrink-0 md:px-1 md:py-0.5 md:gap-1.5 md:rounded-[40px] sm:px-0.75 sm:py-0.5 sm:gap-1">
        {/* Circular Icon */}
        <div className="w-7 h-7 rounded-full bg-purple-primary flex items-center justify-center flex-shrink-0 overflow-hidden md:w-6 md:h-6 sm:w-5 sm:h-5">
          {token.logoUrl ? (
            <img 
              src={token.logoUrl} 
              alt={token.tokenSymbol}
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <span className="text-white text-sm font-bold md:text-xs sm:text-[10px]">{firstLetter}</span>
          )}
        </div>
        
        {/* Token Symbol and Percentage */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white text-sm font-semibold whitespace-nowrap md:text-xs sm:text-[11px]">${token.tokenSymbol}</span>
          <span className={`text-sm font-semibold whitespace-nowrap md:text-xs sm:text-[11px] ${isPositive ? 'text-[#4CAF50]' : 'text-[#f44336]'}`}>
            {isPositive ? '+' : ''}{percentageChange}%
          </span>
        </div>
      </div>
    </Link>
  )
}

import { ListViewRow } from '../../components/token/ListViewRow.jsx'

export default function ListPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'list'
  const [activeFilter, setActiveFilter] = useState('all') // 'all', 'new', 'bonded', 'trending', 'highVolume'
  const [isMobile, setIsMobile] = useState(false)
  const trendingScrollRef = useRef<HTMLDivElement>(null)
  const { activeChain } = useChain()
  const { ethPrice } = useEthPrice()
  const { solPrice } = useSolPrice()
  const { tokens, loading } = useAllTokens(ethPrice, solPrice, activeChain)

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

  // Filter and sort tokens based on search and active filter
  const filteredTokens = useMemo(() => {
    const searchLower = search.toLowerCase()
    let filtered = tokens.filter(item => 
      item.tokenName.toLowerCase().includes(searchLower) ||
      item.tokenSymbol.toLowerCase().includes(searchLower) ||
      (item.tokenAddress && item.tokenAddress.toLowerCase().includes(searchLower)) ||
      (item.bondingCurveAddress && item.bondingCurveAddress.toLowerCase().includes(searchLower))
    )

    // Apply quick filters
    const now = Math.floor(Date.now() / 1000)
    const oneDayAgo = now - 86400 // 24 hours in seconds

    switch (activeFilter) {
      case 'new':
        // Tokens created in the last 24 hours
        filtered = filtered.filter(item => 
          item.createTime && item.createTime >= oneDayAgo
        ).sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
        break
      case 'bonded':
        // Tokens that have completed bonding curve (LP created)
        filtered = filtered.filter(item => item.lpCreated === true)
        break
      case 'trending':
        // Top tokens by 24h price change (positive)
        filtered = filtered
          .filter(item => item.priceChange24h != null && item.priceChange24h > 0)
          .sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0))
        break
      case 'highVolume':
        // Tokens sorted by volume
        filtered = filtered.sort((a, b) => (b.depositedAmount || 0) - (a.depositedAmount || 0))
        break
      default:
        // 'all' - no additional filtering
        break
    }

    return filtered
  }, [tokens, search, activeFilter])

  // Sort by volume to get trending tokens (always from all tokens, not filtered)
  const trendingTokens = useMemo(() => {
    return [...tokens]
      .sort((a, b) => (b.depositedAmount || 0) - (a.depositedAmount || 0))
      .slice(0, 10)
  }, [tokens])

  // Drag scrolling and wheel scrolling for trending list
  useEffect(() => {
    const scrollContainer = trendingScrollRef.current
    if (!scrollContainer) return

    let isDragging = false
    let startX = 0
    let scrollLeft = 0
    let hasMoved = false

    const handleMouseDown = (e) => {
      // Only start dragging if not clicking directly on a link
      if (e.target.closest('a')) {
        // Allow a small delay to check if user is dragging or clicking
        const link = e.target.closest('a')
        const linkRect = link.getBoundingClientRect()
        const clickX = e.clientX - linkRect.left
        
        // If clicking near edges, allow drag
        if (clickX < 10 || clickX > linkRect.width - 10) {
          isDragging = true
          hasMoved = false
          scrollContainer.style.cursor = 'grabbing'
          startX = e.pageX
          scrollLeft = scrollContainer.scrollLeft
          e.preventDefault()
          e.stopPropagation()
        }
      } else {
        isDragging = true
        hasMoved = false
        scrollContainer.style.cursor = 'grabbing'
        startX = e.pageX
        scrollLeft = scrollContainer.scrollLeft
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleMouseLeave = () => {
      if (isDragging) {
        isDragging = false
        scrollContainer.style.cursor = 'grab'
      }
    }

    const handleMouseEnter = () => {
      scrollContainer.style.cursor = 'grab'
    }

    const handleMouseUp = (e) => {
      if (isDragging) {
        // If we didn't move much, navigate via client-side router (no full page reload)
        if (!hasMoved && e.target.closest('a')) {
          const link = e.target.closest('a')
          const href = link?.getAttribute?.('href')
          if (href && typeof window !== 'undefined') {
            router.push(href)
          }
        }
        isDragging = false
        scrollContainer.style.cursor = 'grab'
      }
    }

    const handleMouseMove = (e) => {
      if (!isDragging) return
      e.preventDefault()
      e.stopPropagation()
      const x = e.pageX
      const walk = (x - startX) * 2
      
      // Check if mouse has moved significantly (more than 5px)
      if (Math.abs(x - startX) > 5) {
        hasMoved = true
      }
      
      scrollContainer.scrollLeft = scrollLeft - walk
    }

    // Wheel scrolling
    const handleWheel = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scrollContainer.scrollLeft += e.deltaY
      } else {
        scrollContainer.scrollLeft += e.deltaX
      }
    }

    scrollContainer.addEventListener('mousedown', handleMouseDown, { passive: false })
    scrollContainer.addEventListener('mouseenter', handleMouseEnter)
    scrollContainer.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousemove', handleMouseMove, { passive: false })
    scrollContainer.addEventListener('wheel', handleWheel, { passive: false })
    
    // Set initial cursor style
    scrollContainer.style.cursor = 'grab'
    scrollContainer.style.userSelect = 'none'

    return () => {
      scrollContainer.removeEventListener('mousedown', handleMouseDown)
      scrollContainer.removeEventListener('mouseenter', handleMouseEnter)
      scrollContainer.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousemove', handleMouseMove)
      scrollContainer.removeEventListener('wheel', handleWheel)
      // Reset styles
      if (scrollContainer) {
        scrollContainer.style.cursor = ''
        scrollContainer.style.userSelect = ''
      }
    }
  }, [trendingTokens])


  return (
    <div style={{ background: 'transparent', minHeight: '100vh', paddingTop: '70px' }}>
      <TopBar />

      {/* Trending Tokens Section */}
      {!loading && trendingTokens.length > 0 && (
        <div className="w-full pt-7.5 md:pt-5 sm:pt-5">
          <div className="max-w-[1400px] mx-auto flex items-center gap-4 md:px-4 md:gap-3 sm:px-3 sm:gap-2">
            <div className="flex-shrink-0">
              <h2 className="text-[#ccc] text-lg font-semibold m-0 whitespace-nowrap md:text-base sm:text-sm">Trending</h2>
            </div>
            <div 
              className="flex gap-3 overflow-x-auto flex-1 hide-scrollbar cursor-grab active:cursor-grabbing select-none" 
              ref={trendingScrollRef} 
              style={{ 
                scrollbarWidth: 'none', 
                msOverflowStyle: 'none', 
                WebkitOverflowScrolling: 'touch',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}
            >
              {trendingTokens.map((token) => {
                const link = `/token/${token.tokenAddress}`
                const tokenKey = token.tokenAddress || token.bondingCurveAddress
                
                return (
                  <TrendingCard
                    key={tokenKey}
                    token={token}
                    link={link}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Search Bar and Controls */}
      <div className="w-full py-6 md:py-4 sm:py-3">
        <div className="max-w-[1200px] w-full mx-auto px-6 relative flex items-center box-border md:px-4 sm:px-3">
          <svg className="absolute left-[35px] w-5 h-5 text-text-tertiary pointer-events-none z-[1] md:left-7 md:w-[18px] md:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search tokens by name, symbol, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 px-2.5 py-2 pl-10 bg-bg-secondary border border-purple-primary rounded-lg text-white text-sm font-inherit transition-all duration-200 box-border flex-1 placeholder:text-text-tertiary focus:outline-none focus:border-purple-primary focus:bg-bg-tertiary md:px-2 md:py-2 md:pl-9 md:text-sm sm:px-1.5 sm:py-2 sm:pl-8 sm:text-[13px]"
          />
        </div>
      </div>

      {/* Quick Filter Buttons and View Mode Toggle */}
      <div className="max-w-[1200px] mx-auto px-6 pb-4 md:px-4 md:pb-3 sm:px-3 sm:pb-3">
        <div className="flex justify-between items-center gap-4">
          {/* Sort/Filter Buttons - Left Side */}
          <div className="flex gap-2 flex-wrap">
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap sm:px-3 sm:py-1.5 ${
                activeFilter === 'all' 
                  ? 'bg-purple-primary border-purple-primary text-white' 
                  : 'bg-bg-secondary border border-border text-text-secondary hover:border-purple-primary hover:text-white hover:bg-bg-tertiary'
              }`}
              onClick={() => setActiveFilter('all')}
            >
              All
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap sm:px-3 sm:py-1.5 ${
                activeFilter === 'new' 
                  ? 'bg-purple-primary border-purple-primary text-white' 
                  : 'bg-bg-secondary border border-border text-text-secondary hover:border-purple-primary hover:text-white hover:bg-bg-tertiary'
              }`}
              onClick={() => setActiveFilter('new')}
            >
              New
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap sm:px-3 sm:py-1.5 ${
                activeFilter === 'bonded' 
                  ? 'bg-purple-primary border-purple-primary text-white' 
                  : 'bg-bg-secondary border border-border text-text-secondary hover:border-purple-primary hover:text-white hover:bg-bg-tertiary'
              }`}
              onClick={() => setActiveFilter('bonded')}
            >
              Bonded
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap sm:px-3 sm:py-1.5 ${
                activeFilter === 'trending' 
                  ? 'bg-purple-primary border-purple-primary text-white' 
                  : 'bg-bg-secondary border border-border text-text-secondary hover:border-purple-primary hover:text-white hover:bg-bg-tertiary'
              }`}
              onClick={() => setActiveFilter('trending')}
            >
              Trending
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap sm:px-3 sm:py-1.5 sm:text-xs ${
                activeFilter === 'highVolume' 
                  ? 'bg-purple-primary border-purple-primary text-white' 
                  : 'bg-bg-secondary border border-border text-text-secondary hover:border-purple-primary hover:text-white hover:bg-bg-tertiary'
              }`}
              onClick={() => setActiveFilter('highVolume')}
            >
              High Volume
            </button>
          </div>
          {/* View Mode Toggle - Right Side */}
          {!isMobile && (
            <div className="flex gap-1 bg-bg-secondary border border-border rounded-lg p-1">
              <button
                className={`p-1 bg-transparent border-none rounded text-text-tertiary cursor-pointer transition-all duration-200 flex items-center justify-center hover:text-white hover:bg-bg-tertiary ${
                  viewMode === 'grid' ? 'bg-purple-primary text-white' : ''
                }`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/>
                </svg>
              </button>
              <button
                className={`p-1 bg-transparent border-none rounded text-text-tertiary cursor-pointer transition-all duration-200 flex items-center justify-center hover:text-white hover:bg-bg-tertiary ${
                  viewMode === 'list' ? 'bg-purple-primary text-white' : ''
                }`}
                onClick={() => setViewMode('list')}
                title="List View"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="content-wrapper" style={{ maxWidth: '1200px', margin: '0 auto', padding: spacing.xl }}>
        {loading ? (
          <LoadingSpinner />
        ) : filteredTokens.length === 0 ? (
          <EmptyState message="No tokens found" />
        ) : (viewMode === 'list' || isMobile) ? (
          <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
            {!isMobile && (
              <div className="list-view-header">
                <div></div>
                <div>Token</div>
                <div>Price</div>
                <div>24h</div>
                <div>Market Cap</div>
                <div>Volume</div>
              </div>
            )}
            <div className="max-h-[800px] overflow-y-auto md:max-h-none md:overflow-y-visible md:flex md:flex-col md:gap-0">
              {filteredTokens.map((token) => {
                const tokenKey = token.tokenAddress || token.bondingCurveAddress
                return (
                  <ListViewRow
                    key={tokenKey}
                    token={token}
                    ethPrice={ethPrice}
                    solPrice={solPrice}
                  />
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: spacing.xl 
          }}>
            {filteredTokens.map((token) => {
              const tokenKey = token.tokenAddress || token.bondingCurveAddress
              const LaunchpadCardAny = LaunchpadCard as any
              return (
                <LaunchpadCardAny
                  key={tokenKey}
                  chainId={token.chainId}
                  chain={token.chain}
                  progress={token.progress}
                  bondingThreshold={token.bondingThreshold}
                  tokenName={token.tokenName}
                  tokenSymbol={token.tokenSymbol}
                  logoUrl={token.logoUrl}
                  bondingCurveAddress={token.bondingCurveAddress}
                  tokenAddress={token.tokenAddress}
                  marketCap={token.marketCap}
                  tokenPrice={token.tokenPrice}
                  ethPrice={token.ethPrice}
                  solPrice={token.solPrice}
                  depositedAmount={token.depositedAmount}
                  description={token.description}
                  creator={token.creator}
                  creatorUsername={token.creatorUsername}
                  createTime={token.createTime}
                  lpCreated={token.lpCreated || false}
                  showCollectButton={false}
                  twitter={token.twitter || null}
                  telegram={token.telegram || null}
                  website={token.website || null}
                  priceChange24h={token.priceChange24h !== undefined ? token.priceChange24h : null}
                />
              )
            })}
          </div>
        )}
      </div>

      <div style={{ height: '80px' }}></div>
      <Footer />
    </div>
  )
}
