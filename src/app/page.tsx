'use client'
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useAccount, useBalance } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'
import { readContract } from 'viem/actions'
import { getEvmPublicClient } from '../lib/evmRpcClients'
import { getAddress, formatUnits } from 'viem'
import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { imageUploadUrl, SOLANA_RPC_URL, web3Clients, bondingLimits, SOLANA_BONDING_LIMIT_SOL } from '../lib/constants'
import Footer from '../components/common/Footer'
import TopBar from '../components/common/TopBar'
import InfoCard from '../components/token/InfoCard.jsx'
import Link from 'next/link'

const ChartPlaceholder = () => (
  <div className="min-h-[280px] flex items-center justify-center bg-[#111] rounded-xl">
    <div className="w-8 h-8 border-2 border-purple-primary/50 border-t-purple-primary rounded-full animate-spin" />
  </div>
)

const TradingViewChart = dynamic(
  () => import('../components/charts/TradingViewChart.jsx').then((m) => m.default) as Promise<React.ComponentType<any>>,
  { loading: () => <ChartPlaceholder />, ssr: false }
)
const TradingHistory = dynamic(
  () => import('../components/token/TradingHistory.jsx'),
  { loading: () => <div className="min-h-[120px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-primary/50 border-t-purple-primary rounded-full animate-spin" /></div>, ssr: false }
)
const CommentChat = dynamic(
  () => import('../components/token/CommentChat.jsx'),
  { loading: () => <div className="min-h-[120px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-primary/50 border-t-purple-primary rounded-full animate-spin" /></div>, ssr: false }
)
const SwapCard = dynamic(
  () => import('../components/token/SwapCard.jsx'),
  { loading: () => <div className="min-h-[180px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-primary/50 border-t-purple-primary rounded-full animate-spin" /></div>, ssr: false }
)
import { useAllTokens } from '../lib/hooks/useAllTokens'
import { useEthPrice } from '../lib/hooks/useEthPrice'
import { useSolPrice } from '../lib/hooks/useSolPrice'
import { useChain } from '../lib/context/ChainContext'
import { formatMarketCap } from '../lib/formatting'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { fetchTokenPriceData, subscribeToPriceUpdates, fetchBondingCurve } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { config } from '../lib/config.jsx'
import TokenAbi from '../lib/abis/TokenABI.json'
import ChadAbi from '../lib/abis/BondingCurveABI.json'
import { fetchBondingLimitFromContract } from '../lib/bondingConfig'
import { getCachedBondingCurve, setCachedBondingCurve, invalidateBondingCurve } from '../lib/solana/cache'
import { calculateMarketCap, calculateVolumeUSD, calculateTokenPriceUSD, calculateSolanaMarketCap, calculateSolanaVolumeUSD, calculateSolanaTokenPriceUSD } from '../lib/tokenCalculations'
// CSS converted to Tailwind
// import './List.css'

import { useSupabase } from '../lib/constants'
import { SolanaProgram } from '../lib/solana/program'

/** Chain-derived bonding curve data for current token (same source as token page / SwapCard) */
type CurrentTokenBondingFromChain = {
  bondingCurveAddress: string
  progress: number
  lpCreated: boolean
  depositedAmount?: number
  tokenPrice?: number
  marketCap?: number
  priceUSD?: string
  bondingThreshold: number
} | null

const Home = () => {
  const [search, setSearch] = useState('')
  const [currentTokenIndex, setCurrentTokenIndex] = useState(0)
  const [activeFilter, setActiveFilter] = useState('all') // 'all', 'new', 'bonded', 'trending', 'highVolume'
  const [showSwapModal, setShowSwapModal] = useState(false)
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [swapMode, setSwapMode] = useState('buy') // 'buy' or 'sell'
  const [tokenPriceDatas, setTokenPriceDatas] = useState({})
  const [accountBalance, setAccountBalance] = useState(0)
  const [tokenBalance, setTokenBalance] = useState(0)
  const [tokenAllowance, setTokenAllowance] = useState(0)
  
  const feedContainerRef = useRef<HTMLDivElement>(null)
  const { address, isConnected, chainId: connectedChainId } = useAccount()
  const solanaWallet = useWallet()
  const solanaPublicKey = solanaWallet.publicKey
  const solanaConnected = solanaWallet.connected
  const { activeChain } = useChain()
  const { ethPrice } = useEthPrice()
  const { solPrice } = useSolPrice()
  const { tokens, loading, refetch: refetchTokens, updateTokenByBondingCurve } = useAllTokens(ethPrice, solPrice, activeChain)
  const router = useRouter()
  const [solanaAccountBalance, setSolanaAccountBalance] = useState(0)

  // Chain-derived bonding curve data for the current token (same source as token page / SwapCard context) — used for display so progress is never one-tx behind
  const [currentTokenBondingFromChain, setCurrentTokenBondingFromChain] = useState<CurrentTokenBondingFromChain>(null)

  // Detect mobile device
  const [isMobile, setIsMobile] = useState(false)
  // Detect very small screens (e.g. 320px) for layout adjustments
  const [isVerySmallScreen, setIsVerySmallScreen] = useState(false)
  useEffect(() => {
    const checkMobile = () => {
      if (typeof window !== 'undefined') {
        setIsMobile(window.innerWidth < 768)
        setIsVerySmallScreen(window.innerWidth <= 380)
      }
    }
    checkMobile()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', checkMobile)
      return () => window.removeEventListener('resize', checkMobile)
    }
  }, [])

  // Use wagmi's useBalance hook
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: address,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    }
  })

  useEffect(() => {
    if (balanceData) {
      setAccountBalance(parseFloat(formatUnits(balanceData.value, balanceData.decimals)))
    }
  }, [balanceData])

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
        // Tokens that completed bonding curve (LP created)
        filtered = filtered.filter(item => item.lpCreated === true)
        break
      case 'trending':
        // Top tokens by 24h price change (positive)
        filtered = filtered
          .filter(item => item.priceChange24h !== null && item.priceChange24h !== undefined && item.priceChange24h > 0)
          .sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0))
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

  // Sort by volume to get trending tokens
  const trendingTokens = useMemo(() => {
    return [...tokens]
      .sort((a, b) => (b.depositedAmount || 0) - (a.depositedAmount || 0))
      .slice(0, 10)
  }, [tokens])

  // Get current token
  const currentToken = filteredTokens[currentTokenIndex] || null

  // Fetch price data for current token and subscribe to real-time updates
  useEffect(() => {
    if (!currentToken?.tokenAddress || !useSupabase) return

    let priceSubscription: ReturnType<typeof subscribeToPriceUpdates> | null = null

    const fetchPriceData = async () => {
      try {
        const priceData = await fetchTokenPriceData(currentToken.tokenAddress, 1000)
        setTokenPriceDatas(prev => ({
          ...prev,
          [currentToken.tokenAddress]: priceData
        }))
      } catch (error) {
        console.error('Error fetching price data:', error)
      }
    }

    // Fetch initial data
    fetchPriceData()

    // Subscribe to real-time price updates (Supabase normalizes address per chain)
    priceSubscription = subscribeToPriceUpdates(currentToken.tokenAddress, (newPriceData) => {
      setTokenPriceDatas(prev => {
        const currentData = prev[currentToken.tokenAddress] || []
        // Check if already exists
        const exists = currentData.some(p => p.id === newPriceData.id || 
          (p.transaction_hash === newPriceData.transaction_hash && p.timestamp === newPriceData.timestamp))
        if (exists) return prev
        // Add new data at the beginning (most recent first)
        const updatedData = [newPriceData, ...currentData].slice(0, 1000)
        return {
          ...prev,
          [currentToken.tokenAddress]: updatedData
        }
      })
    })

    // Cleanup subscription on unmount or token change
    return () => {
      if (priceSubscription) {
        supabase.removeChannel(priceSubscription)
      }
    }
  }, [currentToken?.tokenAddress])

  // Fetch token balance for current token (EVM and Solana)
  useEffect(() => {
    const fetchTokenBalance = async () => {
      // Handle Solana tokens
      if (currentToken?.chain === 'solana' && currentToken?.tokenAddress && solanaPublicKey && solanaConnected) {
        try {
          const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
          const mint = new PublicKey(currentToken.tokenAddress)
          const ata = getAssociatedTokenAddressSync(mint, solanaPublicKey, false)
          const bal = await connection.getTokenAccountBalance(ata)
          setTokenBalance(Number(bal.value.uiAmount || 0))
        } catch (error) {
          // No ATA yet or other error
          console.error('Error fetching Solana token balance:', error)
          setTokenBalance(0)
        }
      }
      // Handle EVM tokens: use connected chain so we read from the wallet's network (balance shows in buy/sell modal)
      else if (currentToken?.chain === 'evm' && currentToken?.tokenAddress && address && isConnected) {
        const effectiveChainId = Number(connectedChainId) || currentToken.chainId
        if (effectiveChainId && web3Clients[effectiveChainId]) {
          try {
            const client = getEvmPublicClient(effectiveChainId)
            const tokenBal = await readContract(client, {
              address: getAddress(currentToken.tokenAddress),
              abi: TokenAbi,
              functionName: 'balanceOf',
              args: [address],
            })
            console.log('[god-log] tokenBal', tokenBal)
            setTokenBalance(parseFloat(web3Clients[effectiveChainId].utils.fromWei(String(tokenBal), 'ether')))
            console.log('[god-log] tokenBalance', tokenBalance)
          } catch (error) {
            console.error('Error fetching token balance:', error)
            setTokenBalance(0)
          }
        } else {
          setTokenBalance(0)
        }
      } else {
        setTokenBalance(0)
      }
    }
    fetchTokenBalance()
  }, [currentToken?.tokenAddress, currentToken?.chain, currentToken?.chainId, address, isConnected, connectedChainId, solanaPublicKey, solanaConnected])

  // Fetch token allowance for current token (EVM: use connected chain so modal has correct allowance)
  useEffect(() => {
    const fetchTokenAllowance = async () => {
      if (currentToken?.chain !== 'evm') {
        setTokenAllowance(0)
        return
      }
      if (currentToken?.tokenAddress && currentToken?.bondingCurveAddress && address && isConnected) {
        const effectiveChainId = Number(connectedChainId) || currentToken.chainId
        if (effectiveChainId && web3Clients[effectiveChainId]) {
          try {
            const client = getEvmPublicClient(effectiveChainId)
            const approveAddress = getAddress(currentToken.bondingCurveAddress)
            const allowance = await readContract(client, {
              address: getAddress(currentToken.tokenAddress),
              abi: TokenAbi,
              functionName: 'allowance',
              args: [address, approveAddress],
            })
            setTokenAllowance(parseFloat(web3Clients[effectiveChainId].utils.fromWei(String(allowance), 'ether')))
          } catch (error) {
            console.error('Error fetching token allowance:', error)
            setTokenAllowance(0)
          }
        } else {
          setTokenAllowance(0)
        }
      } else {
        setTokenAllowance(0)
      }
    }
    fetchTokenAllowance()
  }, [currentToken?.tokenAddress, currentToken?.bondingCurveAddress, currentToken?.chain, currentToken?.chainId, address, isConnected, connectedChainId])

  // Refetch Solana balance (e.g. after swap) so token card shows updated balance
  const refetchSolanaBalance = useCallback(async () => {
    if (!solanaConnected || !solanaPublicKey) {
      setSolanaAccountBalance(0)
      return
    }
    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      const balance = await connection.getBalance(solanaPublicKey)
      setSolanaAccountBalance(balance / 1e9)
    } catch (error) {
      console.error('Error fetching Solana balance:', error)
      setSolanaAccountBalance(0)
    }
  }, [solanaConnected, solanaPublicKey])

  // Fetch Solana account balance when Solana wallet is connected
  useEffect(() => {
    refetchSolanaBalance()
  }, [refetchSolanaBalance])

  // Fetch bonding curve from chain for the current token (same logic as token page / SwapCard context) — progress/lpCreated/volume from chain so display is never one-tx behind
  const refetchCurrentTokenBondingFromChain = useCallback(async () => {
    const token = currentToken
    // console.log('[god-log] token', token)
    // console.log('[god-log] updateTokenByBondingCurve', updateTokenByBondingCurve)
    // console.log('[god-log] bondingCurveAddress', token?.bondingCurveAddress)
    if (!token?.bondingCurveAddress || !updateTokenByBondingCurve) return
    const bondingCurveAddress = token.bondingCurveAddress
    const chain = token.chain === 'solana' ? 'solana' : 'evm'
    const chainId = token.chain === 'evm' && token.chainId ? Number(token.chainId) : undefined
    const limit = await fetchBondingLimitFromContract(chain, chainId)
    // console.log('[god-log] limit', limit)
    // console.log('[god-log] bondingLimits', bondingLimits)

    const bondingThreshold = (limit != null && limit > 0) ? limit : (token.chain === 'solana' ? (bondingLimits['solana'] ?? SOLANA_BONDING_LIMIT_SOL) : (bondingLimits[token.chainId as number] || 0.1))
    const basePrice = token.chain === 'solana' ? (solPrice || 0) : (ethPrice || 0)
    // console.log('[god-log] bondingThreshold', bondingThreshold)
    // console.log('[god-log] basePrice', basePrice)
    try {
      if (token.chain === 'evm' && token.chainId) {
        const chainIdNum = Number(token.chainId)
        const client = getEvmPublicClient(chainIdNum)
        const addr = getAddress(bondingCurveAddress)
        const [realEthLpVal, lpCreatedVal, currentTokenPriceVal, volumeVal] = await Promise.all([
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'realEthLp' }),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'lpCreated' }),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'currentTokenPrice' }),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'volume' })
        ])
        const lpCreated = !!lpCreatedVal
        const progress = Math.min(100, (Number(realEthLpVal) / 1e18 / bondingThreshold) * 100)
        const tokenPrice = typeof currentTokenPriceVal === 'bigint' ? Number(currentTokenPriceVal) : Number(currentTokenPriceVal)
        const volumeNum = typeof volumeVal === 'bigint' ? Number(volumeVal) : Number(volumeVal)
        const depositedAmount = basePrice > 0 ? calculateVolumeUSD(volumeNum, basePrice) : 0
        const marketCap = tokenPrice > 0 && basePrice > 0 ? calculateMarketCap(tokenPrice, basePrice) : 0
        const priceUSD = tokenPrice > 0 && basePrice > 0 ? calculateTokenPriceUSD(tokenPrice, basePrice) : '0.000000'
        setCurrentTokenBondingFromChain(prev => ({
          bondingCurveAddress, progress, depositedAmount, tokenPrice, marketCap, priceUSD, bondingThreshold,
          lpCreated: prev?.lpCreated || lpCreated // Sticky: once true, never false
        }))
        updateTokenByBondingCurve(bondingCurveAddress, { progress, depositedAmount, lpCreated, tokenPrice, marketCap, priceUSD })
      } else if (token.chain === 'solana' && token.tokenAddress) {
        let bc = getCachedBondingCurve(token.tokenAddress)
        if (!bc) {
          const programInstance = new SolanaProgram(solanaWallet)
          bc = await programInstance.getBondingCurve(token.tokenAddress)
          if (bc) setCachedBondingCurve(token.tokenAddress, bc)
        }
        if (bc) {
          const progress = bc.complete ? 100 : Math.min((bc.realQuoteReserves / 1e9 / bondingThreshold) * 100, 100)
          // Get current_price and volume from DB so we can show marketCap and volume (same source as token list)
          const dbBc = await fetchBondingCurve(bondingCurveAddress)
          const tokenPriceFromDb = dbBc ? Number(dbBc.current_price) || 0 : 0
          const volumeLamports = dbBc ? Number(dbBc.volume) || 0 : 0
          const marketCap = tokenPriceFromDb > 0 && basePrice > 0 ? calculateSolanaMarketCap(tokenPriceFromDb, basePrice) : 0
          const depositedAmount = volumeLamports > 0 && basePrice > 0 ? calculateSolanaVolumeUSD(volumeLamports, basePrice) : 0
          const priceUSD = tokenPriceFromDb > 0 && basePrice > 0 ? calculateSolanaTokenPriceUSD(tokenPriceFromDb, basePrice) : '0.000000'
          setCurrentTokenBondingFromChain(prev => ({
            bondingCurveAddress, progress, bondingThreshold,
            lpCreated: prev?.lpCreated || bc.complete, // Sticky: once true, never false
            depositedAmount, tokenPrice: tokenPriceFromDb, marketCap, priceUSD
          }))
          updateTokenByBondingCurve(bondingCurveAddress, { progress, lpCreated: bc.complete, depositedAmount, tokenPrice: tokenPriceFromDb, marketCap, priceUSD })
        }
      }
    } catch (e) {
      console.error('List page: fetch bonding curve from chain', e)
    }
  }, [currentToken, updateTokenByBondingCurve, activeChain, ethPrice, solPrice, solanaWallet])

  // When viewing a token, fetch its bonding curve from chain (same source as token page) so progress/volume match SwapCard context
  // Debounce to avoid 429 rate limits when switching tokens rapidly
  useEffect(() => {
    if (!currentToken?.bondingCurveAddress) {
      setCurrentTokenBondingFromChain(null)
      return
    }
    const timer = setTimeout(() => {
      refetchCurrentTokenBondingFromChain()
    }, 300)
    return () => clearTimeout(timer)
  }, [currentToken?.bondingCurveAddress, currentToken?.tokenAddress, currentToken?.chain, currentToken?.chainId, refetchCurrentTokenBondingFromChain])

  // Callback to handle successful swap — close modal, refetch list, refresh balances so next open shows correct balance
  const handleSwapSuccess = () => {
    if (currentToken?.chain === 'solana' && currentToken?.tokenAddress) {
      invalidateBondingCurve(currentToken.tokenAddress)
      refetchSolanaBalance()
    } else if (currentToken?.chain === 'evm') {
      refetchBalance()
    }
    setShowSwapModal(false)
    refetchTokens()
    refetchCurrentTokenBondingFromChain()
    // EVM: RPC may lag — retry refetch at 1.5s and 3.5s for faster token list updates
    if (currentToken?.chain === 'evm') {
      setTimeout(() => refetchCurrentTokenBondingFromChain(), 1500)
      setTimeout(() => refetchCurrentTokenBondingFromChain(), 3500)
    }
  }

  // Navigation functions
  const navigateToToken = (index) => {
    if (index >= 0 && index < filteredTokens.length) {
      setCurrentTokenIndex(index)
      if (feedContainerRef.current) {
        feedContainerRef.current.scrollTop = 0
      }
    }
  }

  const goToPrevious = () => {
    if (currentTokenIndex > 0) {
      navigateToToken(currentTokenIndex - 1)
    }
  }

  const goToNext = () => {
    if (currentTokenIndex < filteredTokens.length - 1) {
      navigateToToken(currentTokenIndex + 1)
    }
  }

  // Keyboard navigation (left/right arrows)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      }
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentTokenIndex, filteredTokens.length])

  if (loading) {
    return (
      <div style={{ background: 'transparent', minHeight: '100vh', paddingTop: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TopBar />
        <div className="text-white">Loading...</div>
        <Footer />
      </div>
    )
  }

  if (filteredTokens.length === 0) {
    return (
      <div style={{ background: 'transparent', minHeight: '100vh', paddingTop: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TopBar />
        <div className="text-white">No tokens found</div>
        <Footer />
      </div>
    )
  }


  return (
    <div 
      style={{ 
        background: 'transparent', 
        minHeight: '100vh', 
        paddingTop: isMobile ? '30px' : '45px',
        position: 'relative'
      }}
    >
      <TopBar />

      {/* Explore Tokens - Floating button on desktop (md+); hidden on mobile (Explore Tokens is in TopBar nav) */}
      {!isMobile && (
      <Link
        href="/list"
        className="fixed rounded-full bg-purple-primary border-none text-white cursor-pointer flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(147,51,234,0.4),0_0_20px_rgba(147,51,234,0.2)] z-[1000] transition-all duration-300 hover:scale-105 hover:shadow-[0_6px_16px_rgba(147,51,234,0.6),0_0_30px_rgba(147,51,234,0.4)] no-underline"
        style={{
          bottom: isVerySmallScreen ? '16px' : isMobile ? '50px' : '70px',
          right: isVerySmallScreen ? '12px' : isMobile ? '20px' : '40px',
          padding: isVerySmallScreen ? '0 12px' : isMobile ? '0 14px' : '0 18px',
          height: isVerySmallScreen ? '44px' : isMobile ? '52px' : '56px',
          borderRadius: '50px',
        }}
      >
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          style={{
            width: isVerySmallScreen ? '18px' : isMobile ? '20px' : '22px',
            height: isVerySmallScreen ? '18px' : isMobile ? '20px' : '22px',
            flexShrink: 0,
          }}
        >
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <span className="font-semibold whitespace-nowrap" style={{ fontSize: isVerySmallScreen ? '12px' : isMobile ? '13px' : '14px' }}>
          Explore Tokens
        </span>
      </Link>
      )}

      {/* Token Feed - One token per screen */}
      <div 
        ref={feedContainerRef}
        className="relative max-w-[850px] mx-auto mb-[50px]"
        style={{
          position: 'relative',
          paddingTop: isMobile ? '20px' : '0',
          marginBottom: isVerySmallScreen ? '140px' : undefined
        }}
      >
        {filteredTokens.map((token, index) => {
          if (index !== currentTokenIndex) return null

          // For Solana tokens, don't lowercase the address in logo URL
          const isSolana = token.chain === 'solana'
          const logoAddress = isSolana ? (token.tokenAddress || '') : (token.tokenAddress || '').toLowerCase()
          const tokenLogoUrl = imageUploadUrl + 'tokens/' + logoAddress + '-logo.png'
          const priceData = tokenPriceDatas[token.tokenAddress] || []
          // Use chain-derived bonding curve data when available (same source as token page / SwapCard) so progress/volume are never one-tx behind
          const fromChain = currentTokenBondingFromChain?.bondingCurveAddress === token.bondingCurveAddress ? currentTokenBondingFromChain : null
          const displayProgress = fromChain != null ? fromChain.progress : token.progress
          const displayVolume = fromChain != null && fromChain.depositedAmount != null ? fromChain.depositedAmount : token.depositedAmount
          const displayTokenPrice = fromChain != null && fromChain.tokenPrice != null ? fromChain.tokenPrice : token.tokenPrice
          const displayMarketCap = fromChain != null && fromChain.marketCap != null ? fromChain.marketCap : token.marketCap
          const displayBondingThreshold = fromChain != null && fromChain.bondingThreshold != null ? fromChain.bondingThreshold : token.bondingThreshold

          return (
            <div
              key={token.tokenAddress || token.bondingCurveAddress}
              className="max-w-[1200px] mx-auto md:w-full md:max-w-full md:p-4"
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: isMobile ? '16px' : '20px',
                paddingTop: isMobile ? '8px' : '20px',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {/* Token Info Card — progress/volume from chain when available (same as token page / SwapCard) */}
              {React.createElement(InfoCard as any, {
                tokenName: token.tokenName,
                tokenSymbol: token.tokenSymbol,
                Logo: <img src={tokenLogoUrl} alt={token.tokenName} style={{ borderRadius: '50%' }} />,
                tokenAddress: token.tokenAddress,
                tokenAge: token.createTime ? Math.floor(Date.now() / 1000) - token.createTime : 0,
                description: token.description,
                creator: token.creator,
                creatorUsername: token.creatorUsername,
                twitter: token.twitter || null,
                telegram: token.telegram || null,
                website: token.website || null,
                bondingCurveAddress: token.bondingCurveAddress,
                effectiveChainId: token.chainId?.toString() || undefined,
                chain: token.chain || 'evm',
                tokenPrice: displayTokenPrice,
                marketCap: displayMarketCap,
                volume: displayVolume,
                progress: displayProgress,
                bondingThreshold: displayBondingThreshold,
                ethPrice: isSolana ? (solPrice || 0) : (ethPrice || 0),
                priceChange24h: token.priceChange24h !== undefined && token.priceChange24h !== null ? token.priceChange24h : undefined,
                simplified: true
              })}

              {/* Price Chart */}
              <div 
                style={{ 
                  width: '100%', 
                  background: '#111',
                  border: '1px solid #9333EA',
                  borderRadius: '12px',
                  boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)',
                  overflow: 'hidden',
                  padding: isMobile ? '8px' : '12px',
                  flexShrink: 0,
                  marginTop: isMobile ? '8px' : '10px',
                  transition: 'all 0.3s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(147, 51, 234, 0.6), 0 0 40px rgba(147, 51, 234, 0.4)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)'
                }}
              >
                <span style={{
                  position: 'absolute',
                  top: isMobile ? '8px' : '12px',
                  right: isMobile ? '8px' : '12px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  background: token.priceChange24h != null && token.priceChange24h < 0 ? '#3d2626' : '#264130',
                  color: token.priceChange24h != null && token.priceChange24h < 0 ? '#f44336' : '#18d78c',
                  fontWeight: '600',
                  zIndex: 10,
                  pointerEvents: 'none'
                }}>
                  {token.priceChange24h !== null && token.priceChange24h !== undefined
                    ? `${token.priceChange24h >= 0 ? '+' : ''}${token.priceChange24h.toFixed(2)}%`
                    : '0%'}
                </span>
                
                <TradingViewChart 
                  tokenPrice={displayTokenPrice}
                  ethPrice={isSolana ? solPrice : ethPrice}
                  tokenPriceDatas={priceData}
                  chartType="candlestick"
                  showControls={true}
                  isMobile={isMobile}
                  chain={isSolana ? 'solana' : 'evm'}
                  onClick={() => {}}
                />
              </div>

              {/* Buy/Sell Buttons - Always Visible, responsive on mobile */}
              <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                gap: isMobile ? '8px' : '16px',
                marginTop: isMobile ? '12px' : '16px',
                flexShrink: 0,
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box'
              }}>
                {/* Buy and Sell buttons - ensure always visible and clickable on mobile */}
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'row', 
                  gap: isMobile ? '8px' : '16px',
                  width: '100%',
                  minWidth: 0,
                  flexWrap: 'nowrap'
                }}>
                  <button
                    onClick={() => {
                      setSwapMode('buy')
                      setShowSwapModal(true)
                    }}
                    className="flex-1 min-w-0 text-white font-bold cursor-pointer transition-all duration-200"
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      padding: isMobile ? '12px 8px' : '16px 24px',
                      background: '#18d78c',
                      border: 'none',
                      borderRadius: isMobile ? '10px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(24, 215, 140, 0.3)',
                      touchAction: 'manipulation'
                    }}
                    suppressHydrationWarning
                    onMouseEnter={(e) => {
                      if (!isMobile) {
                        e.currentTarget.style.background = '#15c77a'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(24, 215, 140, 0.4)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isMobile) {
                        e.currentTarget.style.background = '#18d78c'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(24, 215, 140, 0.3)'
                      }
                    }}
                    onTouchStart={(e) => {
                      if (isMobile) {
                        e.currentTarget.style.opacity = '0.8'
                      }
                    }}
                    onTouchEnd={(e) => {
                      if (isMobile) {
                        e.currentTarget.style.opacity = '1'
                      }
                    }}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => {
                      setSwapMode('sell')
                      setShowSwapModal(true)
                    }}
                    className="flex-1 min-w-0 text-white font-bold cursor-pointer transition-all duration-200"
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      padding: isMobile ? '12px 8px' : '16px 24px',
                      background: '#f44336',
                      border: 'none',
                      borderRadius: isMobile ? '10px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(244, 67, 54, 0.3)',
                      touchAction: 'manipulation'
                    }}
                    suppressHydrationWarning
                    onMouseEnter={(e) => {
                      if (!isMobile) {
                        e.currentTarget.style.background = '#e53935'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(244, 67, 54, 0.4)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isMobile) {
                        e.currentTarget.style.background = '#f44336'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(244, 67, 54, 0.3)'
                      }
                    }}
                    onTouchStart={(e) => {
                      if (isMobile) {
                        e.currentTarget.style.opacity = '0.8'
                      }
                    }}
                    onTouchEnd={(e) => {
                      if (isMobile) {
                        e.currentTarget.style.opacity = '1'
                      }
                    }}
                  >
                    Sell
                  </button>
                </div>

                {/* Mobile: TradingHistory and CommentChat stacked vertically */}
                {isMobile && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                    {/* Recent Trades - Top */}
                    <div style={{ 
                      border: '1px solid #9333EA',
                      borderRadius: '12px',
                      padding: '12px',
                      background: '#111',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)',
                      height: '420px'
                    }}>
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <TradingHistory
                          tokenAddress={token.tokenAddress}
                          chainId={token.chainId}
                          chain={token.chain}
                          contractAddress={token.bondingCurveAddress}
                          tokenPriceDatas={priceData}
                          ethPrice={isSolana ? (solPrice || 0) : (ethPrice || 0)}
                          tokenSymbol={token.tokenSymbol}
                          simplified={true}
                          maxRows={undefined}
                          onViewAll={undefined}
                        />
                      </div>
                    </div>

                    {/* CommentChat - Below */}
                    <div 
                      onClick={() => {
                        setCurrentTokenIndex(filteredTokens.findIndex(t => (t.tokenAddress || t.bondingCurveAddress) === (token.tokenAddress || token.bondingCurveAddress)))
                        setShowCommentModal(true)
                      }}
                      style={{ 
                        border: '1px solid #9333EA',
                        borderRadius: '12px',
                        padding: '12px',
                        background: '#111',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)',
                        height: '420px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (!isMobile) {
                          e.currentTarget.style.boxShadow = '0 0 20px rgba(147, 51, 234, 0.6), 0 0 40px rgba(147, 51, 234, 0.4)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isMobile) {
                          e.currentTarget.style.boxShadow = '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)'
                        }
                      }}
                      onTouchStart={(e) => {
                        e.currentTarget.style.opacity = '0.8'
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.opacity = '1'
                      }}
                    >
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <CommentChat 
                          tokenAddress={token.tokenAddress}
                          showInput={false}
                          simplified={true}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Trades and CommentChat side-by-side (Desktop only) */}
              {!isMobile && (
                <div style={{ 
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '16px',
                  marginTop: '16px',
                  flexShrink: 0,
                  height: '420px'
                }}>
                {/* Recent Trades */}
                <div style={{ 
                  flex: 1,
                  border: '1px solid #9333EA',
                  borderRadius: '12px',
                  padding: '20px',
                  background: '#111',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)'
                }}>
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                  }}
                  className="hide-scrollbar"
                  >
                    <TradingHistory
                      tokenAddress={token.tokenAddress}
                      chainId={token.chainId}
                      chain={token.chain}
                      contractAddress={token.bondingCurveAddress}
                      tokenPriceDatas={priceData}
                      ethPrice={isSolana ? (solPrice || 0) : (ethPrice || 0)}
                      tokenSymbol={token.tokenSymbol}
                      simplified={true}
                      maxRows={undefined}
                      onViewAll={undefined}
                    />
                  </div>
                </div>

                {/* CommentChat */}
                <div 
                  onClick={() => {
                    setCurrentTokenIndex(filteredTokens.findIndex(t => (t.tokenAddress || t.bondingCurveAddress) === (token.tokenAddress || token.bondingCurveAddress)))
                    setShowCommentModal(true)
                  }}
                  style={{ 
                    flex: 1,
                    border: '1px solid #9333EA',
                    borderRadius: '12px',
                    padding: '20px',
                    background: '#111',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(147, 51, 234, 0.6), 0 0 40px rgba(147, 51, 234, 0.4)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)'
                  }}
                >
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                  }}
                  className="hide-scrollbar"
                  >
                    <CommentChat 
                      tokenAddress={token.tokenAddress}
                      simplified={true}
                    />
                  </div>
                </div>
              </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Navigation Controls - Left/Right Arrow Buttons (separate, fixed at page edges) */}
      <button
        onClick={goToPrevious}
        disabled={currentTokenIndex === 0}
        className="fixed left-4 top-1/2 -translate-y-1/2 w-10 h-10 min-[381px]:w-12 min-[381px]:h-12 rounded-full border-2 border-purple-primary bg-black/60 backdrop-blur-[10px] text-purple-primary flex items-center justify-center cursor-pointer transition-all duration-200 shadow-[0_0_8px_rgba(147,51,234,0.4),0_0_15px_rgba(147,51,234,0.2)] hover:bg-purple-primary hover:text-white hover:scale-110 hover:shadow-[0_0_15px_rgba(147,51,234,0.8),0_0_30px_rgba(147,51,234,0.5)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-black/60 disabled:hover:text-purple-primary z-[100]"
        aria-label="Previous token"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <button
        onClick={goToNext}
        disabled={currentTokenIndex === filteredTokens.length - 1}
        className="fixed right-4 top-1/2 -translate-y-1/2 w-10 h-10 min-[381px]:w-12 min-[381px]:h-12 rounded-full border-2 border-purple-primary bg-black/60 backdrop-blur-[10px] text-purple-primary flex items-center justify-center cursor-pointer transition-all duration-200 shadow-[0_0_8px_rgba(147,51,234,0.4),0_0_15px_rgba(147,51,234,0.2)] hover:bg-purple-primary hover:text-white hover:scale-110 hover:shadow-[0_0_15px_rgba(147,51,234,0.8),0_0_30px_rgba(147,51,234,0.5)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-black/60 disabled:hover:text-purple-primary z-[100]"
        aria-label="Next token"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>

      {/* Swap Modal */}
      {showSwapModal && currentToken && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowSwapModal(false)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: '16px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
            onClick={(e) => e.stopPropagation()}
            className="hide-scrollbar"
          >
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px',
              borderBottom: '1px solid #333'
            }}>
              <h2 className="text-white m-0 text-xl" suppressHydrationWarning>
                {swapMode === 'buy' ? 'Buy' : 'Sell'} {currentToken.tokenSymbol}
              </h2>
              <button
                onClick={() => setShowSwapModal(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '28px',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                ×
              </button>
            </div>

            {/* SwapCard in Modal */}
            <SwapCard
              tokenSymbol={currentToken.tokenSymbol}
              tokenLogo={imageUploadUrl + 'tokens/' + (currentToken.chain === 'solana' ? currentToken.tokenAddress : (currentToken.tokenAddress || '').toLowerCase()) + '-logo.png'}
                tokenAddress={currentToken.tokenAddress}
                bondingCurveAddress={currentToken.bondingCurveAddress}
                effectiveChainId={currentToken.chain === 'evm' ? (connectedChainId?.toString() || currentToken.chainId?.toString() || '') : (currentToken.chainId?.toString() || '')}
                chain={currentToken.chain || 'evm'}
                lpCreated={currentToken.lpCreated || false}
                accountBalance={currentToken.chain === 'solana' ? solanaAccountBalance : accountBalance}
                tokenBalance={tokenBalance}
                tokenAllowance={tokenAllowance}
                setTokenAllowance={setTokenAllowance}
                refAddress={''}
                refetchBalance={refetchBalance}
                setTokenBalance={setTokenBalance}
                initialMode={swapMode}
                onSwapSuccess={handleSwapSuccess}
              />
          </div>
        </div>
      )}

      {/* Comment Modal (Mobile only) */}
      {showCommentModal && currentToken && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            zIndex: 500,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px'
          }}
          onClick={() => setShowCommentModal(false)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: '16px',
              maxWidth: '600px',
              margin: '0 auto',
              marginTop: '50px',
              width: '100%',
              height: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
            className="hide-scrollbar"
          >
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px',
              borderBottom: '1px solid #333',
              flexShrink: 0
            }}>
              <h2 className="text-white m-0 text-xl" suppressHydrationWarning>
                Comment
              </h2>
              <button
                onClick={() => setShowCommentModal(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '24px',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                  color: '#fff',
                  lineHeight: '1'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#333'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                ×
              </button>
            </div>

            {/* CommentChat in Modal */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <CommentChat 
                tokenAddress={currentToken.tokenAddress}
                showInput={true}
              />
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}

export default function HomePage() {
  return <Home />
}
