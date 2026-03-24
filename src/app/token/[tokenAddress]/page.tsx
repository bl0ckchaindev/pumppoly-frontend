'use client'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useAccount, useBalance } from 'wagmi'
import { readContract } from 'viem/actions'
import { getEvmPublicClient } from '../../../lib/evmRpcClients'
import { formatUnits, getAddress } from 'viem'
import Web3 from 'web3'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Footer from '../../../components/common/Footer.jsx'
import InfoCard from '../../../components/token/InfoCard.jsx'
import TopBar from '../../../components/common/TopBar.jsx'
import LaunchpadCard from '../../../components/token/LaunchpadCard.jsx'

const ChartPlaceholder = () => (
  <div className="min-h-[280px] flex items-center justify-center bg-[#111] rounded-xl">
    <div className="w-8 h-8 border-2 border-purple-primary/50 border-t-purple-primary rounded-full animate-spin" />
  </div>
)

const TradingViewChart = dynamic(
  () => import('../../../components/charts/TradingViewChart.jsx').then((m) => m.default) as Promise<React.ComponentType<any>>,
  { loading: () => <ChartPlaceholder />, ssr: false }
)
const TradingHistory = dynamic(
  () => import('../../../components/token/TradingHistory.jsx'),
  { loading: () => <div className="min-h-[80px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-primary/50 border-t-purple-primary rounded-full animate-spin" /></div>, ssr: false }
)
const CommentChat = dynamic(
  () => import('../../../components/token/CommentChat.jsx'),
  { loading: () => <div className="min-h-[80px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-primary/50 border-t-purple-primary rounded-full animate-spin" /></div>, ssr: false }
)
const SwapCard = dynamic(
  () => import('../../../components/token/SwapCard.jsx'),
  { loading: () => <div className="min-h-[180px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-purple-primary/50 border-t-purple-primary rounded-full animate-spin" /></div>, ssr: false }
)
import rot13 from '../../../lib/encode'
import Cookies from 'universal-cookie'
import { web3Clients, imageUrl, apiUrl, scanLinks, TOKEN_TOTAL_SUPPLY, initialEth, bondingLimits, useSupabase } from '../../../lib/constants'
import { fetchBondingLimitFromContract } from '../../../lib/bondingConfig'
import { calculateTokenPriceUSD, calculateMarketCap, calculateVolumeUSD } from '../../../lib/tokenCalculations'
import { formatMarketCap } from '../../../lib/formatting'
import { getRouterAddress, getDefaultAddress } from '../../../lib/addressHelpers'
import { config } from '../../../lib/config.jsx'
import ChadAbi from '../../../lib/abis/BondingCurveABI.json'
import TokenAbi from '../../../lib/abis/TokenABI.json'
import { fetchBondingCurve, fetchTokenByAddress, fetchTokenPriceData, subscribeToPriceUpdates } from '../../../lib/supabase'
import { useRealtimeBondingCurve } from '../../../lib/hooks/useRealtimePrice'
import { supabase } from '../../../lib/supabase'
import { useAllTokens } from '../../../lib/hooks/useAllTokens'
import { useEthPrice } from '../../../lib/hooks/useEthPrice'
import { useSolPrice } from '../../../lib/hooks/useSolPrice'
import { useChain } from '../../../lib/context/ChainContext'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'

// Helper function to detect if an address is Solana (base58) or EVM (hex)
const isSolanaAddress = (address: string): boolean => {
  if (!address) return false
  // Solana addresses are base58 encoded, typically 32-44 characters
  // EVM addresses start with 0x and are 42 characters
  if (address.startsWith('0x')) return false
  try {
    // Try to decode as base58 to validate it's a Solana address
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

// Trending Card Component
const TrendingCard = ({ token, link }) => {
  // Use actual 24h price change if available
  const priceChange24h = token.priceChange24h !== null && token.priceChange24h !== undefined ? token.priceChange24h : null
  const percentageChange = priceChange24h !== null ? priceChange24h.toFixed(2) : '0.00'
  const isPositive = priceChange24h !== null ? priceChange24h >= 0 : true
  const firstLetter = token.tokenSymbol?.charAt(0).toUpperCase() || '?'

  return (
    <Link href={link} className="no-underline flex-shrink-0">
      <div className="trending-card">
        {/* Circular Icon */}
        <div className="trending-card-icon">
          {token.logoUrl ? (
            <img
              src={token.logoUrl}
              alt={token.tokenSymbol}
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <span>{firstLetter}</span>
          )}
        </div>

        {/* Token Symbol and Percentage */}
        <div className="trending-card-info">
          <span className="trending-card-symbol">${token.tokenSymbol}</span>
          <span className={`trending-card-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}{percentageChange}%
          </span>
        </div>
      </div>
    </Link>
  )
}

const Token = () => {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  // Get token address from URL path (new format: /token/[tokenAddress])
  const tokenAddressFromPath = params?.tokenAddress as string
  const addressDatas = searchParams?.get('address')
  const chainParam = searchParams?.get('chain')
  const chainId = searchParams?.get('chainId')
  // Infer chain from URL param or from token address when missing (fix: Solana token links must preserve chain)
  const tokenChain: string = chainParam === 'solana' ? 'solana' : (chainParam === 'evm' ? 'evm' : (tokenAddressFromPath && isSolanaAddress(tokenAddressFromPath) ? 'solana' : 'evm'))
  const { address, isConnected, chainId: connectedChainId } = useAccount()
  const solanaWallet = useWallet()
  const solanaPublicKey = solanaWallet.publicKey
  const solanaConnected = solanaWallet.connected
  const { activeChain } = useChain()
  const { ethPrice } = useEthPrice()
  const { solPrice } = useSolPrice()
  const { tokens: allTokens, loading: tokensLoading } = useAllTokens(ethPrice, solPrice, activeChain)

  // Navigation state
  const [currentTokenIndex, setCurrentTokenIndex] = useState(-1)
  const [search, setSearch] = useState('')
  const [showExploreModal, setShowExploreModal] = useState(false)
  const [showChartModal, setShowChartModal] = useState(false)
  const trendingScrollRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(null)

  // Use token address from path if available, otherwise use legacy query param (bonding curve address)
  const tokenAddressFromUrl = tokenAddressFromPath || null
  const [bondingCurveAddressState, setBondingCurveAddress] = useState<string | null>(null)
  const [loadingBondingCurve, setLoadingBondingCurve] = useState(false)
  const [tokenDataFromBackend, setTokenDataFromBackend] = useState<any>(null)
  const [bondingCurveDataFromBackend, setBondingCurveDataFromBackend] = useState<any>(null)
  const [initialDataLoaded, setInitialDataLoaded] = useState(false)

  // bondingCurveAddress is the bonding curve address - use from backend if we have token address, otherwise use legacy query param
  const bondingCurveAddress = bondingCurveAddressState || addressDatas
  // Determine chainId - use from backend token data, query param, or connected chain
  const effectiveChainId = chainId || (tokenDataFromBackend?.chainId ? String(tokenDataFromBackend.chainId) : (connectedChainId ? String(connectedChainId) : '8453'))
  const cookies = new Cookies()
  let refAddress = getDefaultAddress()
  if (cookies.get('ref')) {
    if (Web3.utils.isAddress(rot13(cookies.get('ref')))) {
      refAddress = rot13(cookies.get('ref'))
    }
  }

  const [tokenName, setTokenName] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenAddress, setTokenAddress] = useState('')
  const [tokenPrice, setTokenPrice] = useState(0)
  const [progress, setProgress] = useState(0)
  const [marketCap, setMarketCap] = useState(0)
  const [tokenSupplyUSD, setTokenSupplyUSD] = useState(0)
  const [description, setDescription] = useState('')
  const [lpCreated, setLpCreated] = useState(false)
  const [tokenBalance, setTokenBalance] = useState(0)

  // Use wagmi's useBalance hook for automatic balance updates
  // Use connected chainId if available, otherwise fall back to query param
  const balanceChainId = connectedChainId || (chainId ? Number(chainId) : undefined)
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: address,
    chainId: balanceChainId,
    query: {
      enabled: !!address && !!balanceChainId,
      refetchInterval: 10000, // Refetch every 10 seconds
    }
  })

  const accountBalance = balanceData ? parseFloat(formatUnits(balanceData.value, balanceData.decimals)) : 0
  const [solanaAccountBalance, setSolanaAccountBalance] = useState(0)
  const [tokenAllowance, setTokenAllowance] = useState(0)
  const [tokenPriceDatas, setTokenPriceDatas] = useState<any[]>([])
  const [contractAddress, setContractAddress] = useState('')
  const [tokenAge, setTokenAge] = useState(0)
  const [activeTab, setActiveTab] = useState('trades') // 'trades' or 'comments'
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [bondingLimitFromContract, setBondingLimitFromContract] = useState<number | null>(null)
  const [tradeHistoryRefreshKey, setTradeHistoryRefreshKey] = useState(0)

  // Use ethPrice from hook, but keep local state for compatibility with existing code
  const localEthPrice = ethPrice || 0

  // Fetch bonding limit/threshold from contract when chain is known
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const chain = tokenChain === 'solana' ? 'solana' : 'evm'
      const chainId = tokenChain === 'evm' && effectiveChainId ? Number(effectiveChainId) : undefined
      const limit = await fetchBondingLimitFromContract(chain, chainId)
      if (!cancelled) setBondingLimitFromContract(limit)
    }
    if (tokenChain) load()
    return () => { cancelled = true }
  }, [tokenChain, effectiveChainId])

  // Refetch bonding curve state from chain after swap (buy/sell) so progress shows current state, not one-tx-behind
  const refetchBondingCurveFromChain = useCallback(async () => {
    if (!bondingCurveAddress || !tokenAddress) return
    if (tokenChain === 'evm' && effectiveChainId) {
      try {
        const chainIdNum = Number(effectiveChainId)
        const client = getEvmPublicClient(chainIdNum)
        const addr = getAddress(bondingCurveAddress)
        const [realEthLpVal, lpCreatedVal, currentTokenPriceVal, volumeVal] = await Promise.all([
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'realEthLp' }),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'lpCreated' }),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'currentTokenPrice' }),
          readContract(client, { address: addr, abi: ChadAbi, functionName: 'volume' })
        ])
        const realLp = typeof realEthLpVal === 'bigint' ? Number(realEthLpVal) : Number(realEthLpVal)
        const limit = bondingLimitFromContract ?? (bondingLimits[Number(effectiveChainId)] || 0.1)
        const realLpNative = realLp / 1e18
        setProgress(lpCreatedVal ? 100 : Math.min((realLpNative / limit) * 100, 100))
        setLpCreated(prev => prev || !!lpCreatedVal) // Sticky: once true, never false (LP creation is irreversible)
        const priceNum = typeof currentTokenPriceVal === 'bigint' ? Number(currentTokenPriceVal) : Number(currentTokenPriceVal)
        setTokenPrice(priceNum)
        if (priceNum > 0 && localEthPrice > 0) setMarketCap(calculateMarketCap(priceNum, localEthPrice))
        const volNum = typeof volumeVal === 'bigint' ? Number(volumeVal) : Number(volumeVal)
        if (volNum > 0 && localEthPrice > 0) setTokenSupplyUSD(calculateVolumeUSD(volNum, localEthPrice))
      } catch (e) {
        console.error('Refetch bonding curve from chain (EVM):', e)
      }
    } else if (tokenChain === 'solana' && tokenAddress) {
      try {
        const { SolanaProgram } = await import('../../../lib/solana/program')
        const programInstance = new SolanaProgram(solanaWallet as any)
        const bc = await programInstance.getBondingCurve(tokenAddress)
        if (bc) {
          const realLpLamports = bc.realQuoteReserves
          const limit = bondingLimitFromContract ?? (bondingLimits['solana'] ?? 2)
          setProgress(bc.complete ? 100 : Math.min((realLpLamports / 1e9 / limit) * 100, 100))
          setLpCreated(prev => prev || bc.complete) // Sticky: once true, never false
        }
      } catch (e) {
        console.error('Refetch bonding curve from chain (Solana):', e)
      }
    }
  }, [bondingCurveAddress, tokenAddress, tokenChain, effectiveChainId, bondingLimitFromContract, bondingLimits, localEthPrice, solanaWallet])

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

  // Use real-time Supabase hook for bonding curve updates
  const { bondingCurve: realtimeBondingCurve, isRealtime: isBondingCurveRealtime } = useRealtimeBondingCurve(
    useSupabase ? bondingCurveAddress || undefined : undefined
  )

  // Update bonding curve–related display from Supabase realtime (volume, price, meta).
  // Progress and lpCreated are NEVER set here — they come only from chain (refetchBondingCurveFromChain + FetchData) so the UI is never one-tx behind.
  useEffect(() => {
    if (realtimeBondingCurve && useSupabase) {
      setBondingCurveDataFromBackend({
        creator: realtimeBondingCurve.creator,
        volume: realtimeBondingCurve.volume,
        currentPrice: realtimeBondingCurve.current_price,
        virtualEthLp: realtimeBondingCurve.virtual_eth_lp,
        lpCreated: realtimeBondingCurve.lp_created
      })

      const basePrice = tokenChain === 'solana' ? (solPrice || 0) : localEthPrice
      if (realtimeBondingCurve.volume && basePrice > 0) {
        const volumeRaw = Number(realtimeBondingCurve.volume)
        const volumeUSD = tokenChain === 'solana'
          ? (volumeRaw / 1e9) * basePrice
          : calculateVolumeUSD(volumeRaw, basePrice)
        setTokenSupplyUSD(volumeUSD)
      }

      if (realtimeBondingCurve.current_price) {
        const tokenPriceRaw = Number(realtimeBondingCurve.current_price)
        if (tokenPriceRaw > 0) {
          setTokenPrice(tokenPriceRaw)
          const priceForMc = tokenChain === 'solana' ? (solPrice || 0) : localEthPrice
          if (priceForMc > 0 && tokenPriceRaw > 0) {
            setMarketCap(calculateMarketCap(tokenPriceRaw, priceForMc))
          }
        }
      }
    }
  }, [realtimeBondingCurve, ethPrice, solPrice, effectiveChainId, tokenChain, localEthPrice])

  // Fetch bonding curve address from token contract when we have token address from URL
  useEffect(() => {
    const fetchBondingCurveFromToken = async () => {
      if (!tokenAddressFromUrl) return
      if (bondingCurveAddressState) return // Already fetched
      const isSolana = isSolanaAddress(tokenAddressFromUrl)
      if (!isSolana && !effectiveChainId) return // EVM needs effectiveChainId; Solana does not

      try {
        setLoadingBondingCurve(true)

        // Try to determine address type from database first
        let bcAddress: string | null = null
        let actualTokenAddress: string | null = null

        console.log('[god-log] isSolana', isSolana)
        console.log('[god-log] useSupabase', useSupabase)

        if (useSupabase) {
          try {
            // For Solana addresses, don't lowercase them
            const normalizedAddress = isSolana ? tokenAddressFromUrl : tokenAddressFromUrl.toLowerCase()
            const chain = isSolana ? 'solana' : tokenChain

            // Try as token address first
            const tokenData = await fetchTokenByAddress(normalizedAddress, chain)
            console.log('[god-log] tokenData', tokenData)
            if (tokenData) {
              actualTokenAddress = tokenData.token_address || null
              bcAddress = tokenData.bonding_curve_address
              console.log('[god-log] actualTokenAddress', actualTokenAddress)
              console.log('[god-log] bcAddress', bcAddress)
              if (actualTokenAddress) {
                setTokenAddress(actualTokenAddress)
              }
            } else {
              // Try as bonding curve address
              const bcData = await fetchBondingCurve(normalizedAddress)
              if (bcData) {
                bcAddress = bcData.bonding_curve_address
                actualTokenAddress = bcData.token_address || null
                console.log('[god-log] actualTokenAddress', actualTokenAddress)
                console.log('[god-log] bcAddress', bcAddress)
                if (actualTokenAddress) {
                  setTokenAddress(actualTokenAddress)
                }
              }
            }
          } catch (supabaseError) {
            // If not found in database and it's an EVM address, try contract calls as fallback
            if (!isSolana) {
              console.log('Address not found in Supabase, trying contract calls')
              try {
                const chainIdNum = Number(effectiveChainId)
                const client = getEvmPublicClient(chainIdNum)
                // Try to read bondingCurve function from token contract
                const bondingCurveResult = await readContract(client, {
                  address: getAddress(tokenAddressFromUrl),
                  abi: TokenAbi,
                  functionName: 'bondingCurve',
                })
                bcAddress = bondingCurveResult ? String(bondingCurveResult).toLowerCase() : null
                if (bcAddress) {
                  actualTokenAddress = tokenAddressFromUrl
                }
              } catch (tokenError) {
                // Try to read token function from bonding curve contract
                try {
                  const chainIdNum = Number(effectiveChainId)
                  const client = getEvmPublicClient(chainIdNum)
                  const tokenAddr = await readContract(client, {
                    address: getAddress(tokenAddressFromUrl),
                    abi: ChadAbi,
                    functionName: 'token',
                  })
                  if (tokenAddr) {
                    bcAddress = tokenAddressFromUrl
                    actualTokenAddress = String(tokenAddr).toLowerCase()
                    setTokenAddress(actualTokenAddress)
                  }
                } catch (bcError) {
                  console.error('Could not determine address type from database or contract:', bcError)
                }
              }
            } else {
              // Solana address not found in database - this is expected for newly created tokens
              console.log('Solana address not found in Supabase yet:', tokenAddressFromUrl)
            }
          }
        } else {
          // No Supabase, use contract calls (only for EVM)
          if (!isSolana) {
            try {
              const chainIdNum = Number(effectiveChainId)
              const client = getEvmPublicClient(chainIdNum)
              const bondingCurveResult = await readContract(client, {
                address: getAddress(tokenAddressFromUrl),
                abi: TokenAbi,
                functionName: 'bondingCurve',
              })
              bcAddress = bondingCurveResult ? String(bondingCurveResult).toLowerCase() : null
              if (bcAddress) {
                actualTokenAddress = tokenAddressFromUrl
              }
            } catch (tokenError) {
              try {
                const chainIdNum = Number(effectiveChainId)
                const client = getEvmPublicClient(chainIdNum)
                const tokenAddr = await readContract(client, {
                  address: getAddress(tokenAddressFromUrl),
                  abi: ChadAbi,
                  functionName: 'token',
                })
                if (tokenAddr) {
                  bcAddress = tokenAddressFromUrl
                  actualTokenAddress = String(tokenAddr).toLowerCase()
                  setTokenAddress(actualTokenAddress)
                }
              } catch (bcError) {
                console.error('Could not determine address type:', bcError)
              }
            }
          } else {
            console.warn('Supabase is disabled and address is Solana - cannot fetch data without Supabase')
          }
        }

        if (bcAddress) {
          // For Solana addresses, don't lowercase them
          const normalizedBcAddress = isSolanaAddress(bcAddress) ? bcAddress : String(bcAddress).toLowerCase()
          setBondingCurveAddress(normalizedBcAddress)

          // Fetch token data from Supabase (direct, no API)
          if (useSupabase && actualTokenAddress) {
            try {
              // Normalize addresses based on type
              const normalizedTokenAddress = isSolanaAddress(actualTokenAddress) ? actualTokenAddress : actualTokenAddress.toLowerCase()
              const chain = isSolanaAddress(actualTokenAddress) ? 'solana' : tokenChain

              // Fetch both token and bonding curve data in parallel
              const [tokenData, bcData] = await Promise.all([
                fetchTokenByAddress(normalizedTokenAddress, chain),
                fetchBondingCurve(normalizedBcAddress)
              ])

              if (tokenData) {
                // Set token data immediately with all fields
                setTokenDataFromBackend({
                  creator: tokenData.creator,
                  creatorUsername: tokenData.creatorProfile?.username || null,
                  name: tokenData.name,
                  symbol: tokenData.symbol,
                  description: tokenData.description,
                  twitter: tokenData.twitter || null,
                  telegram: tokenData.telegram || null,
                  website: tokenData.website || null,
                  price_change_24h: tokenData.price_change_24h !== null && tokenData.price_change_24h !== undefined ? tokenData.price_change_24h : null
                })

                // Set token info immediately to avoid flicker
                setTokenName(tokenData.name || 'Unknown Token')
                setTokenSymbol(tokenData.symbol || 'UNKNOWN')
                setDescription(tokenData.description || '')
                setTokenAddress(actualTokenAddress)

                // Calculate token age from bonding curve data
                if (bcData && bcData.start_timestamp) {
                  const startTimestamp = Number(bcData.start_timestamp)
                  const currentTimestamp = Math.floor(Date.now() / 1000)
                  const ageInSeconds = currentTimestamp - startTimestamp
                  setTokenAge(ageInSeconds >= 0 ? ageInSeconds : 0)
                }

                // Mark initial data as loaded
                setInitialDataLoaded(true)
              }

              if (bcData) {
                setBondingCurveDataFromBackend({
                  creator: bcData.creator,
                  volume: bcData.volume,
                  currentPrice: bcData.current_price,
                  virtualEthLp: bcData.virtual_eth_lp,
                  lpCreated: bcData.lp_created
                })
              }
            } catch (err) {
              // Silently handle - token might not be in database yet
              if (err?.code !== 'PGRST116') {
                console.log('Token not found in Supabase:', err)
              }
            }
          }
        } else {
          // If we couldn't determine the address type, show a warning but don't block
          console.warn('Could not determine if address is a token or bonding curve:', tokenAddressFromUrl)
        }
      } catch (error) {
        console.error('Error fetching bonding curve from token:', error)
      } finally {
        setLoadingBondingCurve(false)
      }
    }

    fetchBondingCurveFromToken()
  }, [tokenAddressFromUrl, effectiveChainId, bondingCurveAddressState])

  // Fetch bonding curve data when bonding curve address is available (legacy case)
  // Note: Real-time updates come from useRealtimeBondingCurve hook
  useEffect(() => {
    const fetchBondingCurveData = async () => {
      if (!bondingCurveAddress || bondingCurveDataFromBackend || !useSupabase) return

      try {
        const bcData = await fetchBondingCurve(bondingCurveAddress.toLowerCase())
        if (bcData) {
          setBondingCurveDataFromBackend({
            creator: bcData.creator,
            volume: bcData.volume,
            currentPrice: bcData.current_price,
            virtualEthLp: bcData.virtual_eth_lp,
            lpCreated: bcData.lp_created
          })
        }
      } catch (err) {
        console.error('Error fetching bonding curve data from Supabase:', err)
      }
    }
    fetchBondingCurveData()
  }, [bondingCurveAddress, bondingCurveDataFromBackend])

  // Update volume when backend bonding curve data is available
  useEffect(() => {
    if (bondingCurveDataFromBackend?.volume && localEthPrice > 0) {
      const volumeWei = Number(bondingCurveDataFromBackend.volume)
      const volumeUSD = calculateVolumeUSD(volumeWei, localEthPrice)
      setTokenSupplyUSD(volumeUSD)
    }
  }, [bondingCurveDataFromBackend, localEthPrice])

  const tokenLogo = imageUrl + 'tokens/' + (tokenAddress || tokenAddressFromPath || '').toLowerCase() + '-logo.png'
  // Update referral link to use new URL format if we have token address
  const tokenAddressForLink = tokenAddressFromPath || tokenAddress
  const referlink = address
    ? `https://pumppoly.fun/token/${tokenAddressForLink}/?ref=${rot13(address)}`
    : `https://pumppoly.fun/token/${tokenAddressForLink}`

  useEffect(() => {
    const FetchData = async () => {
      // Wait for bonding curve address if we're loading it
      if (loadingBondingCurve) return
      if (!bondingCurveAddress || !effectiveChainId) return

      try {
        // Check if this is a Solana address
        const isSolana = isSolanaAddress(bondingCurveAddress)

        // ETH price comes from useEthPrice hook, no need to set it here

        // Fetch data from database instead of contract
        if (useSupabase) {
          try {
            // Fetch bonding curve data - normalize address based on type
            const normalizedBcAddress = isSolana ? bondingCurveAddress : bondingCurveAddress.toLowerCase()
            const bcData = await fetchBondingCurve(normalizedBcAddress)
            if (bcData) {
              // Get token address - use from URL if available, otherwise from database
              // Normalize based on type
              const tokenAddrFromUrl = tokenAddressFromUrl
                ? (isSolanaAddress(tokenAddressFromUrl) ? tokenAddressFromUrl : tokenAddressFromUrl.toLowerCase())
                : null
              const tokenAddrFromDb = bcData.token_address
                ? (isSolanaAddress(bcData.token_address) ? bcData.token_address : bcData.token_address.toLowerCase())
                : null
              const tokenAddr = tokenAddrFromUrl || tokenAddrFromDb || ''
              setTokenAddress(tokenAddr)

              // Fetch token data if we have token address
              if (tokenAddr) {
                const chain = isSolana ? 'solana' : tokenChain
                const tokenData = await fetchTokenByAddress(tokenAddr, chain)
                if (tokenData) {
                  // Set all token info at once to avoid flicker
                  setTokenName(tokenData.name || 'Unknown Token')
                  setTokenSymbol(tokenData.symbol || 'UNKNOWN')
                  setDescription(tokenData.description || '')
                  setTokenAddress(tokenAddr)

                  // Set token data from backend with creator profile
                  setTokenDataFromBackend({
                    creator: tokenData.creator,
                    creatorUsername: tokenData.creatorProfile?.username || null,
                    name: tokenData.name,
                    symbol: tokenData.symbol,
                    description: tokenData.description,
                    twitter: tokenData.twitter || null,
                    telegram: tokenData.telegram || null,
                    website: tokenData.website || null,
                    price_change_24h: tokenData.price_change_24h !== null && tokenData.price_change_24h !== undefined ? tokenData.price_change_24h : null
                  })

                  // Calculate token age from bonding curve data (which we already have)
                  if (bcData && bcData.start_timestamp) {
                    const startTimestamp = Number(bcData.start_timestamp)
                    const currentTimestamp = Math.floor(Date.now() / 1000)
                    const ageInSeconds = currentTimestamp - startTimestamp
                    setTokenAge(ageInSeconds >= 0 ? ageInSeconds : 0)
                  }

                  // Mark initial data as loaded
                  if (!initialDataLoaded) {
                    setInitialDataLoaded(true)
                  }
                } else {
                  // Fallback to bonding curve data if token not found
                  setTokenName('Unknown Token')
                  setTokenSymbol('UNKNOWN')
                  setDescription('')
                  setTokenAddress(tokenAddr)

                  // Calculate token age from bonding curve data
                  if (bcData && bcData.start_timestamp) {
                    const startTimestamp = Number(bcData.start_timestamp)
                    const currentTimestamp = Math.floor(Date.now() / 1000)
                    const ageInSeconds = currentTimestamp - startTimestamp
                    setTokenAge(ageInSeconds >= 0 ? ageInSeconds : 0)
                  }

                  setInitialDataLoaded(true)
                }
              }

              // Set values from bonding curve
              const tokenPriceWei = Number(bcData.current_price) || 0
              setTokenPrice(tokenPriceWei)
              setLpCreated(prev => prev || !!(bcData.lp_created)) // Sticky: once true, never false
              setContractAddress(bcData.bonding_curve_address)
            } else {
              // Fallback: try contract if database doesn't have data (only for EVM)
              if (isSolana) {
                console.warn('Solana bonding curve not found in database - cannot use contract fallback')
                throw new Error('Not found in database')
              }
              console.warn('Bonding curve not found in database, falling back to contract')
              throw new Error('Not found in database')
            }
          } catch (dbError) {
            // If database fetch fails, try contract as fallback (only for EVM addresses)
            if (isSolana) {
              console.warn('Database fetch failed for Solana address - cannot use contract fallback:', dbError)
              // Use Supabase data if available
              if (bondingCurveDataFromBackend && tokenDataFromBackend) {
                setTokenName(tokenDataFromBackend.name || 'Unknown Token')
                setTokenSymbol(tokenDataFromBackend.symbol || 'UNKNOWN')
                return
              }
              throw dbError
            }
            console.warn('Database fetch failed, trying contract:', dbError)
            try {
              const chainIdNum = Number(effectiveChainId)
              const client = getEvmPublicClient(chainIdNum)
              const ChadInfo = await readContract(client, {
                address: getAddress(bondingCurveAddress),
                abi: ChadAbi,
                functionName: 'getFunBasicInfo',
              })

              if (!ChadInfo || !ChadInfo[1] || !ChadInfo[2]) {
                console.error('Invalid data returned from getFunBasicInfo')
                return
              }

              // Calculate token age BEFORE setting initial data loaded
              let startTimestamp = 0
              try {
                if (web3Clients[Number(effectiveChainId)]) {
                  const timestamp = await readContract(client, {
                    address: getAddress(bondingCurveAddress),
                    abi: ChadAbi,
                    functionName: 'startTimestamp',
                  })
                  startTimestamp = Number(timestamp)
                }
                if (startTimestamp > 0) {
                  const currentTimestamp = Math.floor(Date.now() / 1000)
                  const ageInSeconds = currentTimestamp - startTimestamp
                  setTokenAge(ageInSeconds >= 0 ? ageInSeconds : 0)
                }
              } catch (e) {
                // Don't block if token age calculation fails
                console.error('Error calculating token age:', e)
              }

              // Set all data at once to avoid flicker
              const tokenAddr = (tokenAddressFromUrl?.toLowerCase() || ChadInfo[2][1]?.toLowerCase()) || ''
              const name = ChadInfo[1][0] || 'Unknown Token'
              const symbol = ChadInfo[1][1] || 'UNKNOWN'
              const desc = ChadInfo[1][6] || ''

              setTokenName(name)
              setTokenSymbol(symbol)
              setTokenAddress(tokenAddr)
              setDescription(desc)

              const tokenPriceWei = typeof ChadInfo[0][7] === 'bigint' ? Number(ChadInfo[0][7]) : Number(ChadInfo[0][7])
              setTokenPrice(tokenPriceWei)
              setLpCreated(ChadInfo[4])
              setContractAddress(ChadInfo[2][0])

              // Mark initial data as loaded AFTER everything is set
              if (!initialDataLoaded) {
                setInitialDataLoaded(true)
              }
            } catch (contractError) {
              console.error('Both database and contract calls failed:', contractError)
              // Use Supabase data if available
              if (bondingCurveDataFromBackend && tokenDataFromBackend) {
                setTokenName(tokenDataFromBackend.name || 'Unknown Token')
                setTokenSymbol(tokenDataFromBackend.symbol || 'UNKNOWN')
                return
              }
              throw contractError
            }
          }
        } else {
          // No Supabase configured, use contract (only for EVM)
          if (isSolana) {
            console.error('Supabase is disabled and address is Solana - cannot fetch data without Supabase')
            throw new Error('Cannot fetch Solana data without Supabase')
          }
          const chainIdNum = Number(effectiveChainId)
          const client = getEvmPublicClient(chainIdNum)
          const ChadInfo = await readContract(client, {
            address: getAddress(bondingCurveAddress),
            abi: ChadAbi,
            functionName: 'getFunBasicInfo',
          })

          if (!ChadInfo || !ChadInfo[1] || !ChadInfo[2]) {
            console.error('Invalid data returned from getFunBasicInfo')
            return
          }

          // Calculate token age BEFORE setting initial data loaded
          let startTimestamp = 0
          try {
            if (web3Clients[Number(effectiveChainId)]) {
              const timestamp = await readContract(client, {
                address: getAddress(bondingCurveAddress),
                abi: ChadAbi,
                functionName: 'startTimestamp',
              })
              startTimestamp = Number(timestamp)
            }
            if (startTimestamp > 0) {
              const currentTimestamp = Math.floor(Date.now() / 1000)
              const ageInSeconds = currentTimestamp - startTimestamp
              setTokenAge(ageInSeconds >= 0 ? ageInSeconds : 0)
            }
          } catch (e) {
            // Don't block if token age calculation fails
            console.error('Error calculating token age:', e)
          }

          // Set all data at once to avoid flicker
          const tokenAddr = (tokenAddressFromUrl?.toLowerCase() || ChadInfo[2][1]?.toLowerCase()) || ''
          const name = ChadInfo[1][0] || 'Unknown Token'
          const symbol = ChadInfo[1][1] || 'UNKNOWN'
          const desc = ChadInfo[1][6] || ''

          setTokenName(name)
          setTokenSymbol(symbol)
          setTokenAddress(tokenAddr)
          setDescription(desc)

          const tokenPriceWei = typeof ChadInfo[0][7] === 'bigint' ? Number(ChadInfo[0][7]) : Number(ChadInfo[0][7])
          setTokenPrice(tokenPriceWei)
          setLpCreated(ChadInfo[4])
          setContractAddress(ChadInfo[2][0])

          // Mark initial data as loaded AFTER everything is set
          if (!initialDataLoaded) {
            setInitialDataLoaded(true)
          }
        }

        // Fetch real price data from Supabase for chart
        if (useSupabase && tokenAddress) {
          try {
            const priceData = await fetchTokenPriceData(tokenAddress, 1000)
            setTokenPriceDatas(priceData)
          } catch (error) {
            console.error('Error fetching price data for chart:', error)
            setTokenPriceDatas([])
          }
        } else {
          setTokenPriceDatas([])
        }

        // Calculate progress, market cap, and volume — PREFER CHAIN so progress is never stale
        // Get bonding curve data (Supabase for volume/fallback; progress/lpCreated from chain when possible)
        let volumeWei = 0
        let isLpCreated = false
        let realEthLp = 0

        if (useSupabase) {
          try {
            const normalizedBcAddr = isSolanaAddress(bondingCurveAddress) ? bondingCurveAddress : bondingCurveAddress.toLowerCase()
            const bcData = realtimeBondingCurve || await fetchBondingCurve(normalizedBcAddr)
            if (bcData) {
              realEthLp = Number(bcData.real_eth_lp) || 0
              volumeWei = Number(bcData.volume) || 0
              isLpCreated = bcData.lp_created || false
            }
          } catch (e) {
            console.error('Error fetching bonding curve for calculations:', e)
          }
        }

        // Progress & lpCreated: always from chain when possible so UI is never one-tx behind
        let progressFromChain: { progress: number; lpCreated: boolean } | null = null
        try {
          if (tokenChain === 'evm' && effectiveChainId && bondingCurveAddress) {
            const chainIdNum = Number(effectiveChainId)
            const client = getEvmPublicClient(chainIdNum)
            const addr = getAddress(bondingCurveAddress)
            const [realEthLpVal, lpCreatedVal] = await Promise.all([
              readContract(client, { address: addr, abi: ChadAbi, functionName: 'realEthLp' }),
              readContract(client, { address: addr, abi: ChadAbi, functionName: 'lpCreated' })
            ])
            const limit = bondingLimitFromContract ?? (bondingLimits[Number(effectiveChainId)] || 0.1)
            const realLpNative = (typeof realEthLpVal === 'bigint' ? Number(realEthLpVal) : Number(realEthLpVal)) / 1e18
            progressFromChain = { progress: lpCreatedVal ? 100 : Math.min((realLpNative / limit) * 100, 100), lpCreated: !!lpCreatedVal }
          } else if (tokenChain === 'solana' && tokenAddress && bondingCurveAddress) {
            const { SolanaProgram } = await import('../../../lib/solana/program')
            const programInstance = new SolanaProgram(solanaWallet as any)
            const bc = await programInstance.getBondingCurve(tokenAddress)
            if (bc) {
              const limit = bondingLimitFromContract ?? (bondingLimits['solana'] ?? 2)
              progressFromChain = { progress: bc.complete ? 100 : Math.min((bc.realQuoteReserves / 1e9 / limit) * 100, 100), lpCreated: bc.complete }
            }
          }
        } catch (e) {
          console.error('FetchData: fetch progress from chain failed', e)
        }

        if (progressFromChain) {
          setProgress(progressFromChain.progress)
          setLpCreated(prev => prev || progressFromChain!.lpCreated) // Sticky: once true, never false
        } else {
          const bondingLimit = bondingLimitFromContract ?? (tokenChain === 'solana' ? (bondingLimits['solana'] ?? 2) : (bondingLimits[Number(effectiveChainId)] || 0.1))
          let progressValue = 0
          if (isLpCreated) progressValue = 100
          else {
            const realLpNative = tokenChain === 'solana' ? realEthLp / 1e9 : realEthLp / 10 ** 18
            if (bondingLimit > 0) progressValue = Math.min((realLpNative / bondingLimit) * 100, 100)
          }
          setProgress(progressValue)
          setLpCreated(prev => prev || isLpCreated) // Sticky: once true, never false
        }

        // Use utility functions for accurate calculations (use SOL price for Solana)
        const tokenPriceWei = tokenPrice || 0
        const basePriceForMc = tokenChain === 'solana' ? (solPrice || 0) : localEthPrice
        if (tokenPriceWei > 0 && basePriceForMc > 0) {
          const marketCapValue = calculateMarketCap(tokenPriceWei, basePriceForMc)
          setMarketCap(marketCapValue)
        }

        const basePriceForVol = tokenChain === 'solana' ? (solPrice || 0) : localEthPrice
        const volumeUSD = tokenChain === 'solana' && volumeWei > 0 && basePriceForVol > 0
          ? (volumeWei / 1e9) * basePriceForVol
          : calculateVolumeUSD(volumeWei, basePriceForVol)
        setTokenSupplyUSD(volumeUSD)

        // Balance/allowance:
        // - EVM: ERC20 balance + allowance
        // - Solana: SOL balance + SPL token ATA balance (no allowance concept)
        if (tokenChain === 'solana') {
          try {
            if (solanaPublicKey) {
              const { Connection, PublicKey } = await import('@solana/web3.js')
              const { getAssociatedTokenAddressSync } = await import('@solana/spl-token')
              const { SOLANA_RPC_URL } = await import('../../../lib/constants')
              const connection = new Connection(SOLANA_RPC_URL, 'confirmed')

              // SOL balance
              const solBal = await connection.getBalance(solanaPublicKey)
              setSolanaAccountBalance(solBal / 1e9)

              // SPL token balance (baseMint ATA)
              if (tokenAddress) {
                const mint = new PublicKey(tokenAddress)
                const ata = getAssociatedTokenAddressSync(mint, solanaPublicKey, false)
                try {
                  const bal = await connection.getTokenAccountBalance(ata)
                  setTokenBalance(Number(bal.value.uiAmount || 0))
                } catch {
                  // No ATA yet
                  setTokenBalance(0)
                }
              }

              // No allowance on Solana
              setTokenAllowance(0)
            }
          } catch (e) {
            console.error('Error fetching Solana balance:', e)
          }
        } else {
          // EVM
          if (address && tokenAddress) {
            try {
              const chainIdNum = Number(effectiveChainId)
              const client = getEvmPublicClient(chainIdNum)
              const tokenBal = await readContract(client, {
                address: getAddress(tokenAddress),
                abi: TokenAbi,
                functionName: 'balanceOf',
                args: [address],
              })
              setTokenBalance(parseFloat(web3Clients[effectiveChainId].utils.fromWei(String(tokenBal), 'ether')))

              const approveAddress = lpCreated ? getRouterAddress(chainIdNum) : bondingCurveAddress
              const allowance = await readContract(client, {
                address: getAddress(tokenAddress),
                abi: TokenAbi,
                functionName: 'allowance',
                args: [address, getAddress(approveAddress)],
              })
              setTokenAllowance(Number(allowance) / 10 ** 18)
            } catch (e) {
              console.error('Error fetching balance/allowance:', e)
            }
          }
        }
      } catch (e) {
        console.error(e)
      }
    }

    // Only poll contract data (not Supabase data - that comes from real-time subscriptions)
    // Poll less frequently if using Supabase real-time for bonding curve updates
    if (bondingCurveAddress && (effectiveChainId || tokenChain === 'solana') && !loadingBondingCurve) {
      FetchData()
      // If using Supabase real-time, only poll contract data every 60s (for token name, symbol, etc.)
      // Bonding curve price/volume updates come from real-time subscription
      const intervalTime = useSupabase && isBondingCurveRealtime ? 60000 : 30000
      const interval = setInterval(FetchData, intervalTime)
      return () => clearInterval(interval)
    }
  }, [bondingCurveAddress, effectiveChainId, address, tokenAddressFromPath, loadingBondingCurve, tokenAddressFromUrl, isBondingCurveRealtime, tokenChain, solPrice, bondingLimitFromContract, tokenAddress, solanaWallet])

  // Fetch price data from backend API periodically
  useEffect(() => {
    const getApi = async () => {
      try {
        if (bondingCurveAddress && effectiveChainId) {
          // ETH price comes from useEthPrice hook, no need to fetch it here
          const price = ethPrice || 0

          // Fetch real price data for chart if Supabase is configured
          if (useSupabase && tokenAddress) {
            try {
              const priceData = await fetchTokenPriceData(tokenAddress, 1000)
              setTokenPriceDatas(priceData)
            } catch (error) {
              console.error('Error fetching price data for chart:', error)
            }
          }
        }
      } catch (e) {
        console.error('Error fetching ETH price:', e)
      }
    }

    if (bondingCurveAddress && effectiveChainId && !loadingBondingCurve) {
      getApi()

      // Subscribe to real-time price updates if Supabase is configured
      let priceSubscription: ReturnType<typeof subscribeToPriceUpdates> | null = null
      if (useSupabase && tokenAddress) {
        priceSubscription = subscribeToPriceUpdates(tokenAddress, (newPriceData) => {
          setTokenPriceDatas(prev => {
            // Check if already exists
            const exists = prev?.some(p => p.id === newPriceData.id ||
              (p.transaction_hash === newPriceData.transaction_hash && p.timestamp === newPriceData.timestamp))
            if (exists) return prev || []
            // Add new data at the beginning (most recent first)
            return [newPriceData, ...(prev || [])].slice(0, 1000)
          })
        })
        // Removed polling interval - price updates come from Supabase real-time subscription
        // Only fetch initial data once
      } else {
        // Fallback: only poll if Supabase is not available
        const interval = setInterval(getApi, 30000)
        return () => {
          clearInterval(interval)
        }
      }

      return () => {
        if (priceSubscription) {
          supabase.removeChannel(priceSubscription)
        }
      }
    }
  }, [bondingCurveAddress, effectiveChainId, loadingBondingCurve, tokenAddress])

  // Show loading state until initial token data is loaded
  // Don't show loading if we don't have a bonding curve address yet (still determining address type)
  const isInitialLoading = !initialDataLoaded && !loadingBondingCurve && bondingCurveAddress && !tokenAddress

  // Find current token index in all tokens list
  useEffect(() => {
    if (allTokens.length > 0 && tokenAddress) {
      const index = allTokens.findIndex(t =>
        t.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase() ||
        t.bondingCurveAddress?.toLowerCase() === bondingCurveAddress?.toLowerCase()
      )
      if (index !== -1) {
        setCurrentTokenIndex(index)
      }
    }
  }, [allTokens, tokenAddress, bondingCurveAddress])

  // Get 24h price change from token data (already calculated on backend)
  useEffect(() => {
    if (tokenDataFromBackend?.price_change_24h !== null && tokenDataFromBackend?.price_change_24h !== undefined) {
      setPriceChange24h(Number(tokenDataFromBackend.price_change_24h))
    } else {
      setPriceChange24h(null)
    }
  }, [tokenDataFromBackend])

  // Navigation functions
  const navigateToToken = (index) => {
    if (index >= 0 && index < allTokens.length) {
      const token = allTokens[index]
      const targetAddress = token.tokenAddress || token.bondingCurveAddress
      if (targetAddress) {
        const chainQ = token.chain === 'solana' ? '?chain=solana' : ''
        router.push(`/token/${targetAddress}${chainQ}`)
        setCurrentTokenIndex(index)
        window.scrollTo(0, 0)
      }
    }
  }

  const goToPrevious = () => {
    if (currentTokenIndex > 0) {
      navigateToToken(currentTokenIndex - 1)
    }
  }

  const goToNext = () => {
    if (currentTokenIndex >= 0 && currentTokenIndex < allTokens.length - 1) {
      navigateToToken(currentTokenIndex + 1)
    }
  }

  const canGoPrevious = currentTokenIndex > 0
  const canGoNext = currentTokenIndex >= 0 && currentTokenIndex < allTokens.length - 1

  // Filter and sort tokens
  const filteredTokens = useMemo(() => {
    return allTokens.filter(item =>
      item.tokenName.toLowerCase().includes(search.toLowerCase()) ||
      item.tokenSymbol.toLowerCase().includes(search.toLowerCase())
    )
  }, [allTokens, search])

  // Sort by volume to get trending tokens
  const trendingTokens = useMemo(() => {
    return [...filteredTokens]
      .sort((a, b) => b.depositedAmount - a.depositedAmount)
      .slice(0, 10)
  }, [filteredTokens])

  // Drag scrolling and wheel scrolling for trending list
  useEffect(() => {
    const scrollContainer = trendingScrollRef.current
    if (!scrollContainer) return

    let isDragging = false
    let startX = 0
    let scrollLeft = 0
    let hasMoved = false

    const handleMouseDown = (e) => {
      isDragging = true
      hasMoved = false
      scrollContainer.style.cursor = 'grabbing'
      startX = e.pageX
      scrollLeft = scrollContainer.scrollLeft
      e.preventDefault()
      e.stopPropagation()
    }

    const handleMouseLeave = () => {
      if (isDragging) {
        isDragging = false
        scrollContainer.style.cursor = 'grab'
      }
    }

    const handleMouseUp = (e) => {
      if (isDragging) {
        // If we didn't move much, navigate via client-side router (no full page reload)
        if (!hasMoved && e.target.closest('a')) {
          const link = e.target.closest('a')
          const href = link?.getAttribute?.('href')
          if (href) router.push(href)
        }
        isDragging = false
        scrollContainer.style.cursor = 'grab'
      }
    }

    const handleMouseMove = (e) => {
      if (!isDragging) return
      e.preventDefault()
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
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        scrollContainer.scrollLeft += e.deltaY
      }
    }

    scrollContainer.addEventListener('mousedown', handleMouseDown)
    scrollContainer.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousemove', handleMouseMove)
    scrollContainer.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      scrollContainer.removeEventListener('mousedown', handleMouseDown)
      scrollContainer.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousemove', handleMouseMove)
      scrollContainer.removeEventListener('wheel', handleWheel)
    }
  }, [trendingTokens])

  return (
    <div
      ref={pageRef}
      style={{
        background: 'transparent',
        minHeight: '100vh',
        paddingTop: '70px',
        position: 'relative'
      }}
    >
      <TopBar />

      {/* Arrow navigation (no swipe - use buttons only) */}
      {!isInitialLoading && initialDataLoaded && tokenAddress && allTokens.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            disabled={currentTokenIndex === 0}
            className="fixed left-4 top-1/2 -translate-y-1/2 w-10 h-10 min-[381px]:w-12 min-[381px]:h-12 rounded-full border-2 border-purple-primary bg-black/60 backdrop-blur-[10px] text-purple-primary flex items-center justify-center cursor-pointer transition-all duration-200 shadow-[0_0_8px_rgba(147,51,234,0.4),0_0_15px_rgba(147,51,234,0.2)] hover:bg-purple-primary hover:text-white hover:scale-110 hover:shadow-[0_0_15px_rgba(147,51,234,0.8),0_0_30px_rgba(147,51,234,0.5)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-black/60 disabled:hover:text-purple-primary z-[100]"
            aria-label="Previous token"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToNext}
            disabled={currentTokenIndex === filteredTokens.length - 1}
            className="fixed right-4 top-1/2 -translate-y-1/2 w-10 h-10 min-[381px]:w-12 min-[381px]:h-12 rounded-full border-2 border-purple-primary bg-black/60 backdrop-blur-[10px] text-purple-primary flex items-center justify-center cursor-pointer transition-all duration-200 shadow-[0_0_8px_rgba(147,51,234,0.4),0_0_15px_rgba(147,51,234,0.2)] hover:bg-purple-primary hover:text-white hover:scale-110 hover:shadow-[0_0_15px_rgba(147,51,234,0.8),0_0_30px_rgba(147,51,234,0.5)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-black/60 disabled:hover:text-purple-primary z-[100]"
            aria-label="Next token"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>

        {/* Explore Modal - Token List/Grid */}
        {showExploreModal && (
          <div
            className="explore-modal-overlay"
            onClick={() => setShowExploreModal(false)}
          >
            <div
              className="explore-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="explore-modal-header">
                <h2>Explore Tokens</h2>
                <button
                  onClick={() => setShowExploreModal(false)}
                  className="close-button"
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
                  onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#333'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
                >
                  ×
                </button>
              </div>

              {/* Trending Section in Modal */}
              {trendingTokens.length > 0 && (
                <div className="trending-section-modal">
                  <h3 className="trending-title">Trending</h3>
                  <div className="trending-scroll" ref={trendingScrollRef}>
                    {trendingTokens.map((token) => {
                      const tokenKey = token.tokenAddress || token.bondingCurveAddress
                      return (
                        <TrendingCard
                          key={tokenKey}
                          token={token}
                          link={`/token/${token.tokenAddress}${token.chain === 'solana' ? '?chain=solana' : ''}`}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Search Bar in Modal */}
              <div className="search-section-modal">
                <div className="search-container">
                  <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search tokens..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>

              {/* Token Grid in Modal */}
              <div className="token-grid-modal">
                {filteredTokens.map((token, index) => {
                  const tokenKey = token.tokenAddress || token.bondingCurveAddress
                  return (
                    <div
                      key={tokenKey}
                      className="token-grid-item"
                      onClick={() => {
                        navigateToToken(index)
                        setShowExploreModal(false)
                      }}
                    >
                      {React.createElement(LaunchpadCard as any, {
                        chainId: token.chainId || undefined,
                        chain: token.chain || 'evm',
                        progress: token.progress,
                        bondingThreshold: token.bondingThreshold,
                        tokenName: token.tokenName,
                        tokenSymbol: token.tokenSymbol,
                        logoUrl: token.logoUrl,
                        bondingCurveAddress: token.bondingCurveAddress,
                        tokenAddress: token.tokenAddress,
                        marketCap: token.marketCap,
                        tokenPrice: token.tokenPrice,
                        ethPrice: token.ethPrice,
                        solPrice: token.solPrice,
                        depositedAmount: token.depositedAmount,
                        description: token.description,
                        creator: token.creator,
                        creatorUsername: token.creatorUsername,
                        createTime: token.createTime,
                        lpCreated: token.lpCreated || false,
                        showCollectButton: false,
                        twitter: token.twitter || null,
                        telegram: token.telegram || null,
                        website: token.website || null,
                        priceChange24h: token.priceChange24h !== undefined ? token.priceChange24h : null
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {isInitialLoading ? (
          <div style={{ textAlign: 'center', color: '#fff', padding: '40px' }}>
            <div>Loading token data...</div>
          </div>
        ) : initialDataLoaded && tokenAddress ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '1200px' }}>
            {/* Token Info Card */}
            {React.createElement(InfoCard as any, {
              tokenName: tokenName,
              tokenSymbol: tokenSymbol,
              Logo: <img src={tokenLogo} alt={tokenName} style={{ borderRadius: '50%' }} />,
              tokenAddress: tokenAddress,
              tokenAge: tokenAge,
              description: description,
              creator: tokenDataFromBackend?.creator || bondingCurveDataFromBackend?.creator,
              creatorUsername: tokenDataFromBackend?.creatorUsername || null,
              twitter: tokenDataFromBackend?.twitter || null,
              telegram: tokenDataFromBackend?.telegram || null,
              website: tokenDataFromBackend?.website || null,
              bondingCurveAddress: bondingCurveAddress,
              effectiveChainId: effectiveChainId,
              chain: tokenChain,
              tokenPrice: tokenPrice,
              marketCap: marketCap,
              volume: tokenSupplyUSD,
              progress: progress,
              bondingThreshold: bondingLimitFromContract ?? undefined,
              ethPrice: tokenChain === 'solana' ? (solPrice || 0) : (ethPrice || localEthPrice),
              priceChange24h: priceChange24h !== null ? priceChange24h : undefined,
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
                background: '#264130',
                color: '#18d78c',
                fontWeight: '600',
                zIndex: 10,
                pointerEvents: 'none'
              }}>
                {priceChange24h !== null && priceChange24h !== undefined
                  ? `${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%`
                  : '0%'}
              </span>

              {React.createElement(TradingViewChart as any, {
                tokenPrice: tokenPrice,
                ethPrice: tokenChain === 'solana' ? solPrice : ethPrice,
                tokenPriceDatas: tokenPriceDatas || [],
                chartType: "candlestick",
                showControls: true,
                isMobile: isMobile,
                defaultExpanded: true,
                chain: tokenChain === 'solana' ? 'solana' : 'evm'
              })}
            </div>

            {/* Large BUY/SELL Buttons */}
            <div style={{
              marginTop: isMobile ? '12px' : '16px',
              padding: isMobile ? '12px' : '16px',
              borderRadius: isMobile ? '10px' : '12px',
              border: '1px solid #9333EA',
              boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)',
              background: '#111',
              flexShrink: 0,
              transition: 'all 0.3s ease',
              position: 'relative'
            }}>
              <SwapCard
                tokenSymbol={tokenSymbol}
                tokenLogo={tokenLogo}
                tokenAddress={tokenAddress || ''}
                bondingCurveAddress={bondingCurveAddress || ''}
                effectiveChainId={effectiveChainId}
                chain={(tokenChain || 'evm') as string}
                lpCreated={lpCreated}
                accountBalance={tokenChain === 'solana' ? solanaAccountBalance : accountBalance}
                tokenBalance={tokenBalance}
                tokenAllowance={tokenAllowance}
                setTokenAllowance={setTokenAllowance}
                refAddress={refAddress}
                refetchBalance={refetchBalance}
                setTokenBalance={setTokenBalance}
                onSwapSuccess={() => {
                  refetchBondingCurveFromChain()
                  setTradeHistoryRefreshKey(k => k + 1)
                  // EVM: RPC nodes may lag — retry refetch at 1.5s and 3.5s to catch propagation (Solana is faster)
                  if (tokenChain === 'evm') {
                    setTimeout(() => refetchBondingCurveFromChain(), 1500)
                    setTimeout(() => refetchBondingCurveFromChain(), 3500)
                  }
                }}
              />
            </div>

            {/* Recent Trades - compact list below SwapCard */}
            <div
              id="recent-trades"
              style={{
                marginTop: '16px',
                border: '1px solid #9333EA',
                borderRadius: '12px',
                padding: '16px',
                background: '#111',
                boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)'
              }}
            >
              <div style={{ color: '#9333EA', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Recent Trades</div>
              <TradingHistory
                tokenAddress={tokenAddressFromPath || tokenAddress || bondingCurveAddress}
                chainId={effectiveChainId}
                chain={tokenChain}
                contractAddress={bondingCurveAddress}
                tokenPriceDatas={tokenPriceDatas || []}
                ethPrice={tokenChain === 'solana' ? (solPrice || 0) : (ethPrice || localEthPrice)}
                tokenSymbol={tokenSymbol}
                simplified={true}
                maxRows={5}
                onViewAll={() => setActiveTab('trades')}
                refreshKey={tradeHistoryRefreshKey}
              />
            </div>

            {/* Trade/Comment Section - Switchable */}
            <div style={{
              marginTop: '20px',
              border: '1px solid #9333EA',
              borderRadius: '12px',
              padding: '20px',
              background: '#111',
              boxShadow: '0 0 15px rgba(147, 51, 234, 0.4), 0 0 30px rgba(147, 51, 234, 0.2)'
            }}>
              {/* Tabs */}
              <div style={{ display: 'flex', marginBottom: '20px' }}>
                <button
                  onClick={() => setActiveTab('trades')}
                  style={{
                    padding: '10px 20px',
                    border: 'none',
                    borderBottom: activeTab === 'trades' ? '2px solid #9333EA' : '2px solid transparent',
                    borderRadius: '6px 6px 0 0',
                    color: activeTab === 'trades' ? '#9333EA' : '#999',
                    textShadow: activeTab === 'trades' ? '0 0 10px rgba(147, 51, 234, 0.8)' : 'none',
                    fontSize: '14px',
                    fontWeight: activeTab === 'trades' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Trades
                </button>
                <button
                  onClick={() => setActiveTab('comments')}
                  style={{
                    padding: '10px 20px',
                    border: 'none',
                    borderBottom: activeTab === 'comments' ? '2px solid #9333EA' : '2px solid transparent',
                    borderRadius: '6px 6px 0 0',
                    color: activeTab === 'comments' ? '#9333EA' : '#999',
                    textShadow: activeTab === 'comments' ? '0 0 10px rgba(147, 51, 234, 0.8)' : 'none',
                    fontSize: '14px',
                    fontWeight: activeTab === 'comments' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Comment
                </button>
              </div>

              {/* Content */}
              {activeTab === 'trades' ? (
                <TradingHistory
                  tokenAddress={tokenAddressFromPath || tokenAddress || bondingCurveAddress}
                  chainId={effectiveChainId}
                  chain={tokenChain}
                  contractAddress={bondingCurveAddress}
                  tokenPriceDatas={tokenPriceDatas || []}
                  ethPrice={tokenChain === 'solana' ? (solPrice || 0) : (ethPrice || localEthPrice)}
                  tokenSymbol={tokenSymbol}
                  maxRows={undefined}
                  onViewAll={undefined}
                  refreshKey={tradeHistoryRefreshKey}
                />
              ) : (
                <CommentChat
                  tokenAddress={tokenAddressFromPath || tokenAddress || bondingCurveAddress}
                />
              )}
            </div>
          </div>
        ) : null}

      </div>


      {/* Chart Modal */}
      {showChartModal && (
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
            flexDirection: 'column',
            padding: '20px'
          }}
          onClick={() => setShowChartModal(false)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #9333EA',
              borderRadius: '16px',
              width: '100%',
              height: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 0 20px rgba(147, 51, 234, 0.6), 0 0 40px rgba(147, 51, 234, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
            className="swap-modal-content"
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
              <h2 style={{ color: '#9333EA', margin: 0, fontSize: '20px', textShadow: '0 0 10px rgba(147, 51, 234, 0.8)' }}>
                Price Chart
              </h2>
              <button
                onClick={() => setShowChartModal(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  background: 'transparent',
                  color: '#fff',
                  fontSize: '24px',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                  lineHeight: '1'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#333'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
              >
                ×
              </button>
            </div>

            {/* Chart in Modal */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {React.createElement(TradingViewChart as any, {
                tokenPrice: tokenPrice,
                ethPrice: tokenChain === 'solana' ? solPrice : ethPrice,
                tokenPriceDatas: (tokenPriceDatas || []) as any[],
                chartType: "line",
                showControls: true,
                onClick: () => { },
                chain: tokenChain === 'solana' ? 'solana' : 'evm'
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ height: '80px' }}></div>
      <Footer />
    </div>
  )
}

export default function TokenPage() {
  return <Token />
}