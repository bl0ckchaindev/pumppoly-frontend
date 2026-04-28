'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import TopBar from '../../components/common/TopBar.jsx'
import { ethPriceApiUrl, solPriceApiUrl, CHAIN_ID, scanLinks, coinNames, imageUploadUrl } from '../../lib/constants'
import Link from 'next/link'
import { fetchTradeHistoryByTrader, fetchTokenByAddress, fetchProfile, updateProfile, fetchUserTokens } from '../../lib/supabase'
import { toast } from 'react-hot-toast'
import apiService from '../../lib/api'
import { useChain } from '../../lib/context/ChainContext'
import { useSupabase } from '../../lib/constants'
import { calculateTokenPriceUSD, calculateSolanaTokenPriceUSD, formatTokenPriceDisplay } from '../../lib/tokenCalculations'
import { isSolanaChain, defaultEvmChainSlug } from '../../lib/chainUtils'

interface TokenHolding {
  tokenAddress: string
  tokenName: string
  tokenSymbol: string
  logoUrl: string
  held: number
  gainPercent: number
  gainNative: number
  avgBuyPrice: number
  currentPrice: number
  priceChange24h: number | null
  chain: 'evm' | 'solana'
}

interface CreatedToken {
  token_address: string
  name: string
  symbol: string
  chain: string
  bondingCurve?: { current_price?: string; volume?: string }
}

const Profile = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const profileAddress = searchParams?.get('address')
  const { walletAddress, activeChain } = useChain()

  // When viewing own profile (no address param, or address matches wallet, or user switched chains),
  // use current walletAddress so profile updates correctly when switching EVM/Solana
  const displayAddress = !profileAddress
    ? walletAddress
    : walletAddress && profileAddress.startsWith('0x') !== walletAddress.startsWith('0x')
      ? walletAddress // Different chain types: user switched, show current wallet
      : profileAddress === walletAddress ||
        (profileAddress.startsWith('0x') && profileAddress.toLowerCase() === walletAddress?.toLowerCase())
        ? walletAddress // Same address: own profile
        : profileAddress

  const isOwnProfile = !!(walletAddress && displayAddress && (
    displayAddress === walletAddress ||
    (displayAddress.startsWith('0x') && displayAddress.toLowerCase() === walletAddress.toLowerCase())
  ))
  const profileChain: 'evm' | 'solana' = displayAddress?.startsWith('0x') ? 'evm' : 'solana'
  const nativeSymbol = coinNames[profileChain] || (profileChain === 'solana' ? 'SOL' : 'ETH')

  // When user switched chains (profileAddress in URL but we use walletAddress), clean URL
  useEffect(() => {
    if (profileAddress && walletAddress && displayAddress === walletAddress && profileAddress !== walletAddress) {
      router.replace('/profile')
    }
  }, [profileAddress, walletAddress, displayAddress, router])

  const [loading, setLoading] = useState(false)
  const [userName, setUserName] = useState('')
  const [userTwitter, setUserTwitter] = useState('')
  const [userTelegram, setUserTelegram] = useState('')
  const [userWebsite, setUserWebsite] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')
  const [showAvatarPlaceholder, setShowAvatarPlaceholder] = useState(false)
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([])
  const [createdTokens, setCreatedTokens] = useState<CreatedToken[]>([])
  const [loadingCreated, setLoadingCreated] = useState(false)
  const [ethPrice, setEthPrice] = useState(0)
  const [solPrice, setSolPrice] = useState(0)
  const [editingName, setEditingName] = useState(false)
  const [tempName, setTempName] = useState('')
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [tempTwitter, setTempTwitter] = useState('')
  const [tempTelegram, setTempTelegram] = useState('')
  const [tempWebsite, setTempWebsite] = useState('')
  const logoFileInput = React.useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (displayAddress) {
      // Reset state when address/chain changes to avoid showing stale EVM data when switching to Solana
      setUserName('')
      setTempName('')
      setUserTwitter('')
      setUserTelegram('')
      setUserWebsite('')
      setTempTwitter('')
      setTempTelegram('')
      setTempWebsite('')
      setLogoFile(null)
      setLogoPreview(null)
      setEditingName(false)

      const avatarPath = profileChain === 'solana' ? displayAddress : (displayAddress || '').toLowerCase()
      setUserAvatarUrl(`${imageUploadUrl}profile/${avatarPath}.png`)
      setShowAvatarPlaceholder(false)

      if (useSupabase) {
        const fetchProfileData = async () => {
          try {
            const profileData = await fetchProfile(displayAddress)
            if (profileData && profileData[0]) {
              const name = profileData[0].username || profileData[0].name
              setUserName(name || '')
              setUserTwitter(profileData[0].twitter || '')
              setUserTelegram(profileData[0].telegram || '')
              setUserWebsite(profileData[0].website || '')
              setTempName(name || '')
              setTempTwitter(profileData[0].twitter || '')
              setTempTelegram(profileData[0].telegram || '')
              setTempWebsite(profileData[0].website || '')
            } else {
              setUserName('')
              setTempName('')
            }
          } catch (error) {
            console.error('Error fetching profile:', error)
            setUserName('')
            setTempName('')
          }
        }
        fetchProfileData()
      } else {
        setUserName('')
        setTempName('')
      }
    }
  }, [displayAddress, profileChain])

  const tokenDecimals = profileChain === 'solana' ? 9 : 18
  const nativeDecimals = profileChain === 'solana' ? 9 : 18

  useEffect(() => {
    if (displayAddress) {
      const fetchHoldings = async () => {
        setLoading(true)
        try {
          const trades = await fetchTradeHistoryByTrader(displayAddress, 1000, profileChain)
          const holdingsMap = new Map<string, {
            tokenAddress: string
            tokenName: string
            tokenSymbol: string
            logoUrl: string
            totalBought: number
            totalSold: number
            totalNativeSpent: number
            totalNativeReceived: number
            buyCount: number
          }>()

          for (const trade of trades) {
            const tokenAddress = profileChain === 'solana'
              ? (trade.token_address || '')
              : (trade.token_address?.toLowerCase() || '')
            if (!tokenAddress) continue

            if (!holdingsMap.has(tokenAddress)) {
              try {
                const token = await fetchTokenByAddress(tokenAddress, profileChain)
                const logoUrl = imageUploadUrl + 'tokens/' + tokenAddress + '-logo.png'
                holdingsMap.set(tokenAddress, {
                  tokenAddress,
                  tokenName: token?.name || 'Unknown Token',
                  tokenSymbol: token?.symbol || 'TOKEN',
                  logoUrl,
                  totalBought: 0,
                  totalSold: 0,
                  totalNativeSpent: 0,
                  totalNativeReceived: 0,
                  buyCount: 0
                })
              } catch (error) {
                console.error('Error fetching token:', error)
                continue
              }
            }

            const holding = holdingsMap.get(tokenAddress)!
            const tokenAmount = Number(trade.token_amount || '0') / Math.pow(10, tokenDecimals)
            const nativeAmount = Number(trade.eth_amount || '0') / Math.pow(10, nativeDecimals)

            if (trade.is_buy) {
              holding.totalBought += tokenAmount
              holding.totalNativeSpent += nativeAmount
              holding.buyCount++
            } else {
              holding.totalSold += tokenAmount
              holding.totalNativeReceived += nativeAmount
            }
          }

          const priceUrl = profileChain === 'solana' ? solPriceApiUrl : ethPriceApiUrl[CHAIN_ID as 8453 | 11155111]
          const priceResponse = await fetch(priceUrl)
          const priceData = await priceResponse.json()
          const nativePriceUsd = priceData.USD || 0

          const holdings: TokenHolding[] = []
          for (const [tokenAddress, holding] of Array.from(holdingsMap.entries())) {
            const held = holding.totalBought - holding.totalSold
            if (held <= 0) continue

            try {
              const token = await fetchTokenByAddress(tokenAddress, profileChain)
              const bondingCurve = token?.bondingCurve
              const currentPrice = bondingCurve ? Number(bondingCurve.current_price) : 0
              const avgBuyPrice = holding.totalBought > 0 ? holding.totalNativeSpent / holding.totalBought : 0
              const currentValue = held * currentPrice
              const costBasis = held * avgBuyPrice
              const gainNative = currentValue - costBasis
              const gainPercent = costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0
              const priceChange24h = token?.price_change_24h != null ? Number(token.price_change_24h) : null

              holdings.push({
                tokenAddress: holding.tokenAddress,
                tokenName: holding.tokenName,
                tokenSymbol: holding.tokenSymbol,
                logoUrl: holding.logoUrl,
                held,
                gainPercent,
                gainNative,
                avgBuyPrice,
                currentPrice,
                priceChange24h,
                chain: profileChain
              })
            } catch (error) {
              console.error('Error calculating gains for token:', error)
              holdings.push({
                tokenAddress: holding.tokenAddress,
                tokenName: holding.tokenName,
                tokenSymbol: holding.tokenSymbol,
                logoUrl: holding.logoUrl,
                held,
                gainPercent: 0,
                gainNative: 0,
                avgBuyPrice: 0,
                currentPrice: 0,
                priceChange24h: null,
                chain: profileChain
              })
            }
          }

          holdings.sort((a, b) => b.gainNative - a.gainNative)
          setTokenHoldings(holdings)
        } catch (error) {
          console.error('Error fetching holdings:', error)
          setTokenHoldings([])
        } finally {
          setLoading(false)
        }
      }
      fetchHoldings()
    }
  }, [displayAddress, profileChain, tokenDecimals, nativeDecimals])

  useEffect(() => {
    if (displayAddress) {
      const loadCreated = async () => {
        setLoadingCreated(true)
        try {
          const tokens = await fetchUserTokens(displayAddress, profileChain)
          setCreatedTokens(tokens || [])
        } catch (error) {
          console.error('Error fetching created tokens:', error)
          setCreatedTokens([])
        } finally {
          setLoadingCreated(false)
        }
      }
      loadCreated()
    }
  }, [displayAddress, profileChain])

  // Fetch native prices (ETH/SOL) for token price display - same as token info element
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const [ethRes, solRes] = await Promise.all([
          fetch(ethPriceApiUrl[CHAIN_ID as 8453 | 11155111]),
          fetch(solPriceApiUrl)
        ])
        const ethData = await ethRes.json()
        const solData = await solRes.json()
        setEthPrice(ethData.USD || 0)
        setSolPrice(solData.USD || 0)
      } catch (e) {
        console.error('Error fetching prices:', e)
      }
    }
    fetchPrices()
  }, [])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }

  const handleSaveProfile = async () => {
    if (!isOwnProfile || !walletAddress) return

    setSaving(true)
    try {
      let avatarUrlToSave: string | null = null
      if (logoFile) {
        try {
          const filename = profileChain === 'solana' ? walletAddress : walletAddress.toLowerCase()
          await apiService.uploadProfile(logoFile, filename)
          avatarUrlToSave = `${imageUploadUrl}profile/${filename}.png`
          setUserAvatarUrl(avatarUrlToSave + '?t=' + Date.now())
          setLogoFile(null)
          setLogoPreview(null)
        } catch (err) {
          console.error('Error uploading profile image:', err)
          toast.error('Avatar upload failed. Other profile changes will still be saved.')
        }
      }

      const updateData: {
        username?: string | null
        twitter?: string | null
        telegram?: string | null
        website?: string | null
        avatar_url?: string | null
      } = {
        username: (tempName?.trim() || walletAddress) || null,
        twitter: tempTwitter || null,
        telegram: tempTelegram || null,
        website: tempWebsite || null
      }
      if (avatarUrlToSave) {
        updateData.avatar_url = avatarUrlToSave
      }

      await updateProfile(walletAddress, updateData)
      setUserName(tempName)
      setUserTwitter(tempTwitter)
      setUserTelegram(tempTelegram)
      setUserWebsite(tempWebsite)
      setEditingName(false)
      toast.success('Profile saved')
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const formatAddress = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // Display name: use custom name if set, else formatted wallet address
  const displayName = userName
    ? (userName === displayAddress || userName.toLowerCase() === displayAddress?.toLowerCase())
      ? formatAddress(displayAddress || '')
      : userName
    : formatAddress(displayAddress || '') || 'Set Display Name'

  return (
    <div className="min-h-screen bg-transparent text-white pt-[70px] relative md:pt-[60px] sm:pt-[56px]">
      <TopBar />
      <div className="max-w-[600px] mx-auto px-5 py-10 md:px-4 md:py-4 sm:px-3 sm:py-3">
        {/* Profile Header */}
        <div className="flex flex-col items-center gap-5 mb-10 md:gap-4 md:mb-8 sm:gap-3 sm:mb-6">
          <div className="relative flex flex-col items-center gap-3 w-[120px] md:w-[100px] sm:w-20">
            <input
              type="file"
              ref={logoFileInput}
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleLogoChange}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => isOwnProfile && logoFileInput.current?.click()}
              className={isOwnProfile ? 'cursor-pointer' : 'cursor-default'}
            >
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Avatar"
                  className="w-[120px] h-[120px] rounded-full border-[3px] border-purple-primary object-cover bg-purple-dark md:w-[100px] md:h-[100px] sm:w-20 sm:h-20 sm:border-2 ring-2 ring-purple-primary/30 ring-offset-2 ring-offset-black"
                />
              ) : showAvatarPlaceholder || !userAvatarUrl ? (
                <div className="w-[120px] h-[120px] rounded-full border-[3px] border-purple-primary bg-[#251939] flex items-center justify-center md:w-[100px] md:h-[100px] md:[&_svg]:w-[50px] md:[&_svg]:h-[50px] sm:w-20 sm:h-20 sm:border-2 sm:[&_svg]:w-10 sm:[&_svg]:h-10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[60px] h-[60px] text-purple-light">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
              ) : (
            <img
                  src={userAvatarUrl}
              alt="Avatar"
                  className="w-[120px] h-[120px] rounded-full border-[3px] border-purple-primary object-cover bg-purple-dark md:w-[100px] md:h-[100px] sm:w-20 sm:h-20 sm:border-2"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    setShowAvatarPlaceholder(true)
              }}
            />
              )}
            </div>
          </div>

          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: '#111',
                  border: '2px solid #9333EA',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '18px',
                  fontFamily: 'inherit'
                }}
                autoFocus
                placeholder="Enter display name"
              />
              <button
                onClick={() => {
                  setTempName(userName)
                  setEditingName(false)
                }}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div 
              className="flex items-center gap-2 text-lg font-medium text-white cursor-pointer transition-colors duration-200 hover:text-purple-primary md:text-base sm:text-sm"
              onClick={() => isOwnProfile && setEditingName(true)}
              style={{ cursor: isOwnProfile ? 'pointer' : 'default' }}
            >
              {displayName}
              {isOwnProfile && (
                <svg className="w-4 h-4 text-purple-primary md:w-3.5 md:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              )}
            </div>
          )}

          <div className="px-5 py-3 bg-[#251939] border-2 border-purple-primary rounded-lg text-white font-mono text-sm inline-block md:px-4 md:py-2.5 md:text-xs sm:px-3 sm:py-2 sm:text-[11px]">
            <a
              href={`${profileChain === 'solana' ? scanLinks.solana : (scanLinks[CHAIN_ID] || scanLinks[8453])}address/${displayAddress || ''}`}
              target="_blank"
              rel="noreferrer"
              className="text-inherit no-underline cursor-pointer transition-opacity hover:opacity-70"
            >
              {formatAddress(displayAddress || '')}
            </a>
          </div>

          {isOwnProfile && (
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="mt-4 px-6 py-3 bg-gradient-purple-pink border-none rounded-lg text-white text-base font-semibold cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 hover:-translate-y-0.5 md:px-5 md:py-2.5 md:text-[15px] sm:px-4 sm:py-2 sm:text-sm sm:min-w-[140px]"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>

        {/* Social Links Section */}
        <div className="mb-10 md:mb-8 sm:mb-6">
          <h2 className="text-xl font-semibold text-white mb-5 md:text-lg md:mb-4 sm:text-base sm:mb-3">Social Links</h2>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-secondary border border-border rounded-lg transition-colors duration-200 focus-within:border-purple-primary md:px-3.5 md:py-3 sm:px-3 sm:py-2.5">
              <svg className="w-5 h-5 flex-shrink-0 md:w-[18px] md:h-[18px]" viewBox="0 0 24 24" fill="#1DA1F2">
                <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
              </svg>
              <input
                type="text"
                value={tempTwitter}
                onChange={(e) => setTempTwitter(e.target.value)}
                placeholder="https://twitter.com/yourhandle"
                className="flex-1 bg-transparent border-none text-white text-base font-inherit outline-none disabled:text-text-tertiary disabled:cursor-not-allowed placeholder:text-text-tertiary md:text-[15px] sm:text-sm"
                disabled={!isOwnProfile}
              />
            </div>

            <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-secondary border border-border rounded-lg transition-colors duration-200 focus-within:border-purple-primary md:px-3.5 md:py-3 sm:px-3 sm:py-2.5">
              <svg className="w-5 h-5 flex-shrink-0 md:w-[18px] md:h-[18px]" viewBox="0 0 24 24" fill="#0088cc">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16l-1.84 8.66c-.138.625-.497.78-1.006.485l-2.78-2.05-1.34 1.29c-.155.155-.285.285-.585.285l.2-2.83 5.14-4.64c.224-.2-.05-.31-.346-.11l-6.35 4.01-2.74-.86c-.595-.19-.61-.595.12-.89l10.7-4.13c.495-.18.93.11.76.65z"/>
              </svg>
              <input
                type="text"
                value={tempTelegram}
                onChange={(e) => setTempTelegram(e.target.value)}
                placeholder="https://t.me/yourhandle"
                className="flex-1 bg-transparent border-none text-white text-base font-inherit outline-none disabled:text-text-tertiary disabled:cursor-not-allowed placeholder:text-text-tertiary md:text-[15px] sm:text-sm"
                disabled={!isOwnProfile}
              />
          </div>

            <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-secondary border border-border rounded-lg transition-colors duration-200 focus-within:border-purple-primary md:px-3.5 md:py-3 sm:px-3 sm:py-2.5">
              <svg className="w-5 h-5 flex-shrink-0 text-purple-primary md:w-[18px] md:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <input
                type="text"
                value={tempWebsite}
                onChange={(e) => setTempWebsite(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="flex-1 bg-transparent border-none text-white text-base font-inherit outline-none disabled:text-text-tertiary disabled:cursor-not-allowed placeholder:text-text-tertiary md:text-[15px] sm:text-sm"
                disabled={!isOwnProfile}
              />
        </div>
          </div>
        </div>

        {/* Your Tokens Section */}
        {/* <div className="mb-10 md:mb-8 sm:mb-6">
          <h2 className="text-xl font-semibold text-white mb-5 md:text-lg md:mb-4 sm:text-base sm:mb-3">Your Tokens</h2>
          {loading ? (
            <div className="text-center py-[60px] px-5 text-text-tertiary md:py-[40px] sm:py-[30px]">
              <div className="text-base mt-4 md:text-sm sm:text-sm">Loading...</div>
            </div>
          ) : tokenHoldings.length === 0 ? (
            <div className="text-center py-[60px] px-5 text-text-tertiary md:py-[40px] sm:py-[30px]">
              <div className="text-base mt-4 md:text-sm sm:text-sm">No token holdings</div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {tokenHoldings.map((holding) => (
                        <Link
                  key={holding.tokenAddress}
                  href={`/token/${holding.tokenAddress}`}
                  className="flex items-start gap-4 px-4 py-4 bg-bg-secondary border border-border rounded-xl transition-all duration-200 cursor-pointer hover:border-purple-primary hover:-translate-y-0.5 md:px-3 md:py-3 md:gap-3 sm:px-2.5 sm:py-2.5 sm:gap-2.5 sm:flex-col sm:items-start"
                        >
                          <img
                    src={holding.logoUrl}
                    alt={holding.tokenName}
                    className="w-14 h-14 rounded-xl object-cover bg-bg-tertiary flex-shrink-0 self-start md:w-12 md:h-12 sm:w-10 sm:h-10"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.src = '/img/logo.png'
                    }}
                  />
                  <div className="flex-1 flex flex-col gap-1 min-w-0">
                    <div className="text-base font-semibold text-white md:text-sm sm:text-sm">
                      {holding.tokenName} ${holding.tokenSymbol}
                          </div>
                    <div className="text-sm text-text-tertiary md:text-xs sm:text-xs">
                      Held: {holding.held.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    {holding.priceChange24h !== null && holding.priceChange24h !== undefined && (
                      <div className="text-xs font-semibold sm:text-[11px]" style={{
                        color: holding.priceChange24h >= 0 ? '#4CAF50' : '#f44336',
                        }}>
                        {holding.priceChange24h >= 0 ? '+' : ''}{holding.priceChange24h.toFixed(2)}% (24h)
                      </div>
                    )}
                      </div>
                  <div className="flex flex-col items-end gap-1 md:flex-row md:justify-between md:w-full md:items-center sm:flex-row sm:justify-between sm:w-full sm:items-center">
                    <div className="text-base font-semibold text-[#10B981] flex items-center gap-1 md:text-sm sm:text-sm">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="18 15 12 9 6 15"/>
                      </svg>
                      +{holding.gainPercent.toFixed(1)}%
                    </div>
                    <div className="text-sm text-[#10B981] flex items-center gap-1 md:text-xs sm:text-xs">
                      +{holding.gainNative.toFixed(4)} {nativeSymbol}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div> */}

        {/* My Tokens */}
        <div className="mb-10 md:mb-8 sm:mb-6">
          <h2 className="text-xl font-semibold text-white mb-5 md:text-lg md:mb-4 sm:text-base sm:mb-3">My Tokens</h2>
          {loadingCreated ? (
            <div className="text-center py-[60px] px-5 text-text-tertiary md:py-[40px] sm:py-[30px]">
              <div className="text-base mt-4 md:text-sm sm:text-sm">Loading...</div>
            </div>
          ) : createdTokens.length === 0 ? (
            <div className="text-center py-[60px] px-5 text-text-tertiary md:py-[40px] sm:py-[30px]">
              <div className="text-base mt-4 md:text-sm sm:text-sm">You haven&apos;t created any tokens yet</div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {createdTokens.map((token) => (
                <Link
                  key={token.token_address}
                  href={`/token/${token.token_address}`}
                  className="flex items-start gap-4 px-4 py-4 bg-bg-secondary border border-border rounded-xl transition-all duration-200 cursor-pointer hover:border-purple-primary hover:-translate-y-0.5 md:px-3 md:py-3 md:gap-3 sm:px-2.5 sm:py-2.5 sm:gap-2.5 sm:flex-col sm:items-start"
                >
                  <img
                    src={`${imageUploadUrl}tokens/${token.token_address}-logo.png`}
                    alt={token.name}
                    className="w-14 h-14 rounded-xl object-cover bg-bg-tertiary flex-shrink-0 self-start md:w-12 md:h-12 sm:w-10 sm:h-10"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = '/img/logo.png'
                    }}
                  />
                  <div className="flex-1 flex flex-col gap-1 min-w-0">
                    <div className="text-base font-semibold text-white md:text-sm sm:text-sm">
                      {token.name} ${token.symbol}
                    </div>
                    <div className="text-sm text-text-tertiary md:text-xs sm:text-xs">
                      {isSolanaChain(token.chain) ? 'Solana' : String(token.chain || defaultEvmChainSlug()).toUpperCase()}
                    </div>
                    {token.bondingCurve?.current_price != null && Number(token.bondingCurve.current_price) > 0 && (() => {
                      const tokenPriceRaw = Number(token.bondingCurve.current_price)
                      const priceUSDStr = isSolanaChain(token.chain)
                        ? calculateSolanaTokenPriceUSD(tokenPriceRaw, solPrice)
                        : calculateTokenPriceUSD(tokenPriceRaw, ethPrice)
                      return (
                        <div className="text-xs text-purple-primary">
                          ${formatTokenPriceDisplay(priceUSDStr)}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="text-sm text-text-tertiary md:text-xs">
                    View →
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  return <Profile />
}
