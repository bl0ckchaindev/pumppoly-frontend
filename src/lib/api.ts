/**
 * API service layer for backend communication
 * Only image upload endpoints are kept
 */

import { apiUrl } from './constants'

class ApiService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // Don't set Content-Type for FormData - browser will set it with boundary
    const isFormData = options?.body instanceof FormData
    
    // For FormData, don't set any headers (let browser set Content-Type with boundary)
    // For other requests, set Content-Type to application/json
    const headers = isFormData
      ? undefined // Let browser set Content-Type automatically for FormData
      : {
          'Content-Type': 'application/json',
          ...options?.headers,
        }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      ...(headers && { headers }), // Only include headers if they exist
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API Error: ${response.statusText} - ${errorText}`)
    }

    return response.json()
  }

  // Upload endpoints - only image uploads kept
  async uploadLogo(file: File, filename: string) {
    if (!file) {
      throw new Error('No file provided for upload')
    }
    
    const formData = new FormData()
    formData.append('file', file, filename)
    
    console.log('Uploading logo:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      filename: filename,
      endpoint: `${this.baseUrl}/uploads/logo`
    })
    
    return this.request('/uploads/logo', {
      method: 'POST',
      body: formData,
      // No headers - browser will set Content-Type with boundary for FormData
    })
  }

  async uploadBanner(file: File, filename: string) {
    if (!file) {
      throw new Error('No file provided for upload')
    }
    const formData = new FormData()
    formData.append('file', file, filename)
    return this.request('/uploads/banner', {
      method: 'POST',
      body: formData,
    })
  }

  async uploadProfile(file: File, filename: string) {
    if (!file) {
      throw new Error('No file provided for upload')
    }
    const formData = new FormData()
    formData.append('file', file, filename)
    return this.request('/uploads/profile', {
      method: 'POST',
      body: formData,
    })
  }

  async uploadCommentImage(file: File) {
    if (!file) {
      throw new Error('No file provided for upload')
    }
    const formData = new FormData()
    formData.append('image', file)
    return this.request('/uploads/comment', {
      method: 'POST',
      body: formData,
    })
  }

  // Trader fee (Solana TRADER_FEE or EVM TraderFee) – claimable by traders
  // Chain is auto-detected from wallet address if not provided
  // Rewards are capped at 2% of total rewards pool per trader
  async getTraderFeeClaimable(walletAddress: string, chain?: 'solana' | 'evm'): Promise<{
    walletAddress: string
    chain: string
    claimableAmount: string
    claimableFormatted: string
    isCapped: boolean // true if reward was capped at maxRewardPercentage
    maxRewardPercentage: number // 0.02 = 2%
    claimableLamports: string
    claimableSol?: string
    claimableEth?: string
    count: number
  }> {
    if (!walletAddress?.trim()) {
      throw new Error('walletAddress is required')
    }
    const params = new URLSearchParams({ wallet: walletAddress.trim() })
    if (chain) {
      params.append('chain', chain)
    }
    return this.request(`/trader-fee-claimable?${params}`)
  }

  async claimTraderFee(walletAddress: string, chain?: 'solana' | 'evm'): Promise<{
    success: boolean
    chain: string
    transactionHash: string
    transactionSignature?: string
    amount: string
    amountFormatted: string
    amountLamports: string
    amountSol?: string
    amountEth?: string
    walletAddress: string
  }> {
    if (!walletAddress?.trim()) {
      throw new Error('walletAddress is required')
    }
    return this.request('/claim-trader-fee', {
      method: 'POST',
      body: JSON.stringify({ 
        walletAddress: walletAddress.trim(),
        ...(chain && { chain })
      }),
    })
  }

  // Creator fee (Solana or EVM) – claimable by token creators
  // Chain is auto-detected from wallet address if not provided
  async getCreatorFeeClaimable(walletAddress: string, chain?: 'solana' | 'evm'): Promise<{
    walletAddress: string
    chain: string
    claimableAmount: string
    claimableFormatted: string
    claimableLamports: string
    claimableSol?: string
    claimableEth?: string
    tokenCount: number
  }> {
    if (!walletAddress?.trim()) {
      throw new Error('walletAddress is required')
    }
    const params = new URLSearchParams({ wallet: walletAddress.trim() })
    if (chain) {
      params.append('chain', chain)
    }
    return this.request(`/creator-fee-claimable?${params}`)
  }

  /**
   * Process an EVM trade by transaction hash. Call after a successful buy/sell swap
   * so token_price_data is inserted for the chart (fallback when backend event listener misses).
   */
  async processEVMTrade(transactionHash: string, bondingCurveAddress: string): Promise<{ success: boolean; processed?: number; error?: string }> {
    return this.request('/tokens/process-trade', {
      method: 'POST',
      body: JSON.stringify({
        transactionHash: transactionHash.trim(),
        bondingCurveAddress: bondingCurveAddress.trim().toLowerCase()
      })
    })
  }

  /**
   * Ensure backend is listening to a bonding curve for trade events.
   * Call when token page loads.
   */
  async ensureBondingCurveListening(bondingCurveAddress: string): Promise<{ success: boolean; error?: string }> {
    return this.request('/tokens/ensure-listening', {
      method: 'POST',
      body: JSON.stringify({
        bondingCurveAddress: bondingCurveAddress.trim().toLowerCase()
      })
    })
  }

  /** Register an EVM token with the backend after on-chain creation (ensures it appears in DB and list). */
  async registerEVMToken(payload: {
    chainId: number
    transactionHash: string
    tokenAddress: string
    bondingCurveAddress: string
    creator: string
    name: string
    symbol: string
    description?: string
    website?: string
    twitter?: string
    telegram?: string
    blockNumber?: number
    timestamp?: number
    logoUrl?: string
    bannerUrl?: string
  }): Promise<{ success: boolean; isNew?: boolean; token?: unknown; bondingCurve?: unknown; error?: string }> {
    return this.request('/tokens/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  // Reward distribution config (next distribution time)
  async getRewardDistributionConfig(): Promise<{
    cycle: string
    rewardRatio: number
    nextDistributionAt: string
    minimumRewardLamports: string
  }> {
    return this.request('/reward-distribution/config')
  }
}

export const apiService = new ApiService(apiUrl)
export default apiService

