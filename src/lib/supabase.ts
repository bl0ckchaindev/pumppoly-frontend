import { createClient } from '@supabase/supabase-js'
import { PublicKey } from '@solana/web3.js'
import { defaultEvmChainSlug } from './chainUtils'

// RealtimeChannel type - inferred from Supabase client channel method
type RealtimeChannel = ReturnType<ReturnType<typeof createClient>['channel']>

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

// Helper function to normalize address based on chain type
const normalizeAddress = (address: string): string => {
  if (!address) return address
  // Solana addresses should not be lowercased
  if (isSolanaAddress(address)) {
    return address
  }
  // EVM addresses should be lowercased
  return address.toLowerCase()
}

// Support both REACT_APP_ and NEXT_PUBLIC_ for migration compatibility
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://krvcmfshrxkocicbhtpb.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtydmNtZnNocnhrb2NpY2JodHBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTY5ODMsImV4cCI6MjA4MTk5Mjk4M30.ITVK1bcTPsYCTdcVAbmBRiVzv-hpGxyfNGXenYQWr4I'


// Validate Supabase configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase is not properly configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY in your .env file.')
}

// Create Supabase client with proper configuration
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-key', {
  auth: {
    persistSession: typeof window !== 'undefined', // Only persist on client
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})


// Types for database tables
export interface ChatMessage {
  id: string
  token_address: string
  sender: string
  content: string
  image_url: string
  timestamp: number
  created_at: string
}

export interface TokenPriceData {
  id: string
  token_address: string
  timestamp: number
  open_price: string
  close_price: string
  amount: string
  trader: string
  is_buy: boolean
  transaction_hash: string
  block_number: number
  created_at: string
}

export interface BondingCurve {
  id: string
  bonding_curve_address: string
  token_address: string
  creator: string
  virtual_eth_lp: string
  virtual_token_lp: string
  real_eth_lp: string
  real_token_lp: string
  k: string
  token_start_price: string
  current_price: string
  volume: string
  total_trades: number
  total_buyers: number
  total_sellers: number
  lp_created: boolean
  liquidity_token_id: string | null
  liquidity_lock_duration_seconds?: string | null
  liquidity_unlock_timestamp?: number | null
  lp_unlocked?: boolean
  start_timestamp: number
  transaction_hash: string
  block_number: number
  status: string
  created_at: string
  updated_at: string
}

export interface TradeHistory {
  id: string
  token_address: string
  bonding_curve_address: string
  trader: string
  is_buy: boolean
  eth_amount: string
  token_amount: string
  price: string
  transaction_hash: string
  block_number: number
  timestamp: number
  created_at: string
}

// Real-time subscription helpers
// Enable Realtime for chat_messages in Supabase (run in SQL Editor):
//   ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
// Then in Dashboard → Database → Replication, ensure chat_messages is in the publication.
export type ChatChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'

export function subscribeToChat(
  tokenAddress: string,
  onNewMessage: (message: ChatMessage) => void,
  onStatusChange?: (status: ChatChannelStatus, err?: unknown) => void
): RealtimeChannel {
  const normalizedAddress = normalizeAddress(tokenAddress)
  const channel = supabase
    .channel(`chat:${normalizedAddress}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `token_address=eq.${normalizedAddress}`
      },
      (payload) => {
        const row = payload?.new as Record<string, unknown> | undefined
        if (!row) return
        const message: ChatMessage = {
          id: (row.id as string) ?? '',
          token_address: (row.token_address as string) ?? '',
          sender: (row.sender as string) ?? (row.Sender as string) ?? '',
          content: (row.content as string) ?? (row.Content as string) ?? '',
          image_url: (row.image_url as string) ?? (row.imageUrl as string) ?? (row.ImageUrl as string) ?? '',
          timestamp: Number(row.timestamp ?? row.Timestamp ?? 0),
          created_at: (row.created_at as string) ?? ''
        }
        onNewMessage(message)
      }
    )
    .subscribe((status, err) => {
      const s = status as ChatChannelStatus
      if (s === 'CHANNEL_ERROR') {
        console.warn('[chat] Realtime subscription error (messages still save; enable Replication for chat_messages):', err)
      } else if (s === 'TIMED_OUT') {
        console.warn('[chat] Realtime subscription timed out')
      }
      onStatusChange?.(s, err)
    })
  return channel
}

export function subscribeToPriceUpdates(
  tokenAddress: string,
  onPriceUpdate: (data: TokenPriceData) => void
): RealtimeChannel {
  const normalizedAddress = normalizeAddress(tokenAddress)
  return supabase
    .channel(`price:${normalizedAddress}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'token_price_data',
        filter: `token_address=eq.${normalizedAddress}`
      },
      (payload) => {
        onPriceUpdate(payload.new as TokenPriceData)
      }
    )
    .subscribe()
}

export function subscribeToBondingCurve(
  bondingCurveAddress: string,
  onUpdate: (data: BondingCurve) => void
): RealtimeChannel {
  // Use normalizeAddress so Solana addresses are not lowercased (fix: realtime updates for Solana tokens)
  const normalizedAddress = normalizeAddress(bondingCurveAddress)
  return supabase
    .channel(`bonding:${normalizedAddress}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'bonding_curves',
        filter: `bonding_curve_address=eq.${normalizedAddress}`
      },
      (payload) => {
        onUpdate(payload.new as BondingCurve)
      }
    )
    .subscribe()
}

export function subscribeToTrades(
  tokenAddress: string,
  onNewTrade: (trade: TradeHistory) => void
): RealtimeChannel {
  const normalizedAddress = normalizeAddress(tokenAddress)
  return supabase
    .channel(`trades:${normalizedAddress}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'trade_history',
        filter: `token_address=eq.${normalizedAddress}`
      },
      (payload) => {
        onNewTrade(payload.new as TradeHistory)
      }
    )
    .subscribe()
}

// Fetch functions - try normalized first, then fallbacks for backwards compatibility
export async function fetchChatMessages(tokenAddress: string): Promise<ChatMessage[]> {
  if (!tokenAddress?.trim()) return []

  const trimmed = tokenAddress.trim()
  const normalizedAddress = normalizeAddress(trimmed)

  const runQuery = async (addr: string): Promise<ChatMessage[]> => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('token_address', addr)
      .order('timestamp', { ascending: false })
    if (error) throw error
    return data || []
  }

  try {
    let data = await runQuery(normalizedAddress)
    if (data.length === 0) {
      if (trimmed !== normalizedAddress) {
        const fallback = await runQuery(trimmed)
        if (fallback.length > 0) data = fallback
      }
      if (data.length === 0 && trimmed.startsWith('0x')) {
        const lower = trimmed.toLowerCase()
        if (lower !== normalizedAddress && lower !== trimmed) {
          const fallback2 = await runQuery(lower)
          if (fallback2.length > 0) data = fallback2
        }
      }
    }
    return data
  } catch (err) {
    console.error('fetchChatMessages error:', err)
    throw err
  }
}

export async function fetchTokenPriceData(
  tokenAddress: string,
  limit = 1000
): Promise<TokenPriceData[]> {
  const normalizedAddress = normalizeAddress(tokenAddress)
  const { data, error } = await supabase
    .from('token_price_data')
    .select('*')
    .eq('token_address', normalizedAddress)
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function fetchBondingCurve(
  bondingCurveAddress: string
): Promise<BondingCurve | null> {
  try {
    // Normalize address: lowercase EVM addresses, keep Solana addresses as-is
    const normalizedAddress = normalizeAddress(bondingCurveAddress)
    
    const { data, error } = await supabase
      .from('bonding_curves')
      .select('*')
      .eq('bonding_curve_address', normalizedAddress)
      .single()

    // PGRST116 = no rows returned (not an error, just no data)
    if (error && error.code !== 'PGRST116') {
      // Log but don't throw for 406 errors (might be RLS or query format issue)
      if (error.code === 'PGRST301' || error.message?.includes('406')) {
        console.log('Supabase query issue (might be RLS or format):', error.message)
        return null
      }
      throw error
    }
    return data
  } catch (error) {
    console.log('Error fetching bonding curve:', error)
    return null
  }
}

export async function fetchTradeHistory(
  tokenAddress: string,
  limit = 100
): Promise<TradeHistory[]> {
  const normalizedAddress = normalizeAddress(tokenAddress)
  const { data, error } = await supabase
    .from('trade_history')
    .select('*')
    .eq('token_address', normalizedAddress)
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function fetchTradeHistoryByTrader(
  traderAddress: string,
  limit = 100,
  chain?: 'evm' | 'solana'
): Promise<TradeHistory[]> {
  const normalizedTrader = normalizeAddress(traderAddress)
  let query = supabase
    .from('trade_history')
    .select('*')
    .eq('trader', normalizedTrader)
    .order('timestamp', { ascending: false })
    .limit(limit)
  if (chain) {
    query = query.eq('chain', chain)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Insert functions (for posting comments) - sender normalized for EVM/Solana
export async function postChatMessage(
  tokenAddress: string,
  sender: string,
  content: string,
  imageUrl = ''
): Promise<ChatMessage> {
  const normalizedSender = normalizeAddress(sender)
  const ts = Date.now()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      token_address: normalizeAddress(tokenAddress),
      sender: normalizedSender,
      content,
      image_url: imageUrl,
      timestamp: ts
    })
    .select()
    .single()

  if (error) throw error
  const row = data as Record<string, unknown> | undefined
  if (!row) throw new Error('No row returned from insert')
  // Return normalized shape so component and realtime handlers use same structure
  return {
    id: (row.id as string) ?? '',
    token_address: (row.token_address as string) ?? '',
    sender: (row.sender as string) ?? (row.Sender as string) ?? normalizedSender,
    content: (row.content as string) ?? (row.Content as string) ?? content,
    image_url: (row.image_url as string) ?? (row.imageUrl as string) ?? imageUrl,
    timestamp: Number(row.timestamp ?? row.Timestamp ?? ts),
    created_at: (row.created_at as string) ?? ''
  }
}

// Profile functions (support both EVM and Solana via normalizeAddress)
export async function fetchProfile(walletAddress: string): Promise<any> {
  const normalized = normalizeAddress(walletAddress)
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('wallet_address', normalized)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data ? [data] : [] // Return as array for backward compatibility
}

export async function updateProfile(
  walletAddress: string,
  updates: {
    username?: string | null
    bio?: string | null
    twitter?: string | null
    telegram?: string | null
    website?: string | null
    avatar_url?: string | null
  }
): Promise<any> {
  const normalized = normalizeAddress(walletAddress)
  // First, check if profile exists
  const existing = await fetchProfile(walletAddress)
  
  // Filter out null/undefined values and empty strings, but keep empty strings as null
  const cleanUpdates: any = {
    wallet_address: normalized
  }
  
  // Only include fields that are explicitly provided, convert empty strings to null
  if (updates.username !== undefined) {
    cleanUpdates.username = updates.username && String(updates.username).trim() ? String(updates.username).trim() : null
  }
  if (updates.bio !== undefined) {
    cleanUpdates.bio = updates.bio && String(updates.bio).trim() ? String(updates.bio).trim() : null
  }
  if (updates.twitter !== undefined) {
    cleanUpdates.twitter = updates.twitter && String(updates.twitter).trim() ? String(updates.twitter).trim() : null
  }
  if (updates.telegram !== undefined) {
    cleanUpdates.telegram = updates.telegram && String(updates.telegram).trim() ? String(updates.telegram).trim() : null
  }
  if (updates.website !== undefined) {
    cleanUpdates.website = updates.website && String(updates.website).trim() ? String(updates.website).trim() : null
  }
  if (updates.avatar_url !== undefined) {
    cleanUpdates.avatar_url = updates.avatar_url && String(updates.avatar_url).trim() ? String(updates.avatar_url).trim() : null
  }

  if (existing && existing.length > 0) {
    // Update existing profile
    const { data, error } = await supabase
      .from('profiles')
      .update(cleanUpdates)
      .eq('wallet_address', normalized)
      .select()
      .single()

    if (error) {
      console.error('Error updating profile:', error)
      throw error
    }
    return data
  } else {
    // Create new profile
    const { data, error } = await supabase
      .from('profiles')
      .insert(cleanUpdates)
      .select()
      .single()

    if (error) {
      console.error('Error creating profile:', error)
      throw error
    }
    return data
  }
}

// Subscribe to profile updates
export function subscribeToProfile(
  walletAddress: string,
  onUpdate: (data: any) => void
): RealtimeChannel {
  return supabase
    .channel(`profile:${walletAddress}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `wallet_address=eq.${walletAddress.toLowerCase()}`
      },
      (payload) => {
        onUpdate(payload.new)
      }
    )
    .subscribe()
}

// Token functions
export async function fetchTokenByAddress(tokenAddress: string, chain?: string): Promise<any> {
  try {
    // Normalize address: lowercase EVM addresses, keep Solana addresses as-is
    const normalizedAddress = normalizeAddress(tokenAddress)
    
    const { data: token } = await supabase
    .from('tokens')
    .select('*')
    .eq('token_address', normalizedAddress)
    .eq('chain', chain || defaultEvmChainSlug())
    .single()
    // let query = supabase
    //   .from('tokens')
    //   .select('*')
    //   .eq('token_address', tokenAddress.toLowerCase())
    // console.log('[god-log] query', query)
    // if (chain) {
    //   query = query.eq('chain', chain)
    // }
    // console.log('[god-log] query', query)
    // const { data: token, error } = await query.single()
    // console.log('[god-log] token', token)
    // PGRST116 = no rows returned (not an error, just no data)
    // if (error && error.code !== 'PGRST116') {
    //   // Log but don't throw for 406 errors (might be RLS or query format issue)
    //   if (error.code === 'PGRST301' || error.message?.includes('406')) {
    //     console.log('Supabase query issue (might be RLS or format):', error.message)
    //     return null
    //   }
    //   throw error
    // }

    if (!token) {
      return null
    }

    // Fetch creator profile if creator address exists
    let creatorProfile: { username: string | null } | null = null
    if (token.creator) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_address, username')
          .eq('wallet_address', token.creator.toLowerCase())
          .single()

        if (profile) {
          creatorProfile = {
            username: profile.username || null
          }
        }
      } catch (profileError) {
        // Silently handle - profile might not exist
      }
    }

    return {
      ...token,
      creatorProfile: creatorProfile
    }
  } catch (error) {
    console.log('Error fetching token:', error)
    return null
  }
}

// Fetch all tokens with their bonding curve data and creator profiles
export async function fetchAllTokensWithBondingCurves(chainId?: number, chain?: string): Promise<any[]> {
  try {
    if (!supabase) {
      console.warn('Supabase client not initialized. Returning empty array.')
      return []
    }

    // First, get all tokens
    let query = supabase
      .from('tokens')
      .select('*')
      .eq('status', 'active')
    
    // Filter by chain if explicitly specified
    // If chain is explicitly provided, filter by it
    // Otherwise, fetch ALL tokens (both EVM and Solana) for homepage display
    if (chain) {
      query = query.eq('chain', chain)
    }
    // NOTE: Removed chainId-based EVM filter to allow fetching all tokens
    // The homepage should show both EVM and Solana tokens
    
    query = query.order('timestamp', { ascending: false })

    const { data: tokens, error: tokensError } = await query

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError)
      // Check for CORS or network errors
      if (tokensError.message?.includes('Failed to fetch') || tokensError.message?.includes('NetworkError')) {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown'
        console.error('Network/CORS error: Make sure Supabase CORS is configured to allow requests from:', origin)
      }
      return []
    }

    if (!tokens || tokens.length === 0) {
      return []
    }

    // Get all bonding curve addresses from tokens (normalize based on chain)
    const bondingCurveAddresses = tokens.map(t => normalizeAddress(t.bonding_curve_address))
    
    // Get all unique creator addresses from tokens (normalize based on chain)
    const creatorAddresses = Array.from(new Set(
      tokens.map(t => {
        const isSolana = t.chain === 'solana'
        return isSolana ? t.creator : t.creator?.toLowerCase()
      }).filter(Boolean)
    ))

    // Fetch all bonding curves
    const { data: bondingCurves, error: bcError } = await supabase
      .from('bonding_curves')
      .select('*')
      .in('bonding_curve_address', bondingCurveAddresses)
      .eq('status', 'active')

    if (bcError) {
      console.error('Error fetching bonding curves:', bcError)
      // Return tokens without bonding curve data if bonding curves fail
      return tokens.map(token => ({
        ...token,
        bondingCurve: null,
        creatorProfile: null
      }))
    }

    // Fetch all creator profiles
    let profilesMap = new Map()
    if (creatorAddresses.length > 0) {
      try {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('wallet_address, username')
          .in('wallet_address', creatorAddresses)

        if (!profilesError && profiles) {
          profiles.forEach(profile => {
            // Store both original and lowercased for lookup
            profilesMap.set(profile.wallet_address, {
              username: profile.username || null
            })
            profilesMap.set(profile.wallet_address.toLowerCase(), {
              username: profile.username || null
            })
          })
        }
      } catch (profileError) {
        console.error('Error fetching creator profiles:', profileError)
        // Continue without profiles if fetch fails
      }
    }

    // Create a map of bonding curves by address for quick lookup
    const bcMap = new Map()
    bondingCurves?.forEach(bc => {
      // Store with normalized address (original for Solana, lowercase for EVM)
      bcMap.set(normalizeAddress(bc.bonding_curve_address), bc)
    })

    // Combine tokens with their bonding curves and creator profiles
    return tokens.map(token => {
      const bcAddress = normalizeAddress(token.bonding_curve_address)
      const creatorAddress = token.chain === 'solana' ? token.creator : token.creator?.toLowerCase()
      return {
        ...token,
        bondingCurve: bcMap.get(bcAddress) || null,
        creatorProfile: profilesMap.get(creatorAddress) || null
      }
    })
  } catch (error) {
    console.error('Error fetching all tokens:', error)
    return []
  }
}

// Fetch all tokens created by a specific user with bonding curve and profile data (supports chain for Solana)
export async function fetchUserTokens(creatorAddress: string, chain?: 'evm' | 'solana'): Promise<any[]> {
  try {
    const normalizedCreator = normalizeAddress(creatorAddress)
    let query = supabase
      .from('tokens')
      .select('*')
      .eq('creator', normalizedCreator)
      .eq('status', 'active')
      .order('timestamp', { ascending: false })
    if (chain) {
      query = query.eq('chain', chain)
    }
    const { data: tokens, error } = await query

    if (error) {
      console.error('Error fetching user tokens:', error)
      return []
    }

    if (!tokens || tokens.length === 0) {
      return []
    }

    // Normalize bonding curve addresses per chain (Solana: as-is, EVM: lowercase)
    const normalizeBc = (addr: string) => (chain === 'solana' ? addr : (addr || '').toLowerCase())
    const bondingCurveAddresses = tokens.map(t => normalizeBc(t.bonding_curve_address))
    let bcQuery = supabase
      .from('bonding_curves')
      .select('*')
      .in('bonding_curve_address', bondingCurveAddresses)
      .eq('status', 'active')
    if (chain) {
      bcQuery = bcQuery.eq('chain', chain)
    }
    const { data: bondingCurves } = await bcQuery

    const bcMap = new Map<string, any>()
    bondingCurves?.forEach(bc => {
      bcMap.set(normalizeBc(bc.bonding_curve_address), bc)
    })

    // Fetch creator profile (use normalizeAddress for lookup)
    let creatorProfile: { username: string | null } | null = null
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_address, username')
        .eq('wallet_address', normalizedCreator)
        .single()

      if (profile) {
        creatorProfile = {
          username: profile.username || null
        }
      }
    } catch (profileError) {
      // Silently handle - profile might not exist
    }

    return tokens.map(token => ({
      ...token,
      bondingCurve: bcMap.get(normalizeBc(token.bonding_curve_address)) || null,
      creatorProfile: creatorProfile
    }))
  } catch (error) {
    console.error('Error fetching user tokens:', error)
    return []
  }
}

// Fetch trending tokens (sorted by volume) with creator profiles
export async function fetchTrendingTokens(limit: number = 10): Promise<any[]> {
  try {
    // First get top bonding curves by volume
    const { data: bondingCurves, error } = await supabase
      .from('bonding_curves')
      .select('*')
      .eq('status', 'active')
      .order('volume', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching trending tokens:', error)
      return []
    }

    if (!bondingCurves || bondingCurves.length === 0) {
      return []
    }

    // Get token addresses from bonding curves
    const tokenAddresses = bondingCurves
      .map(bc => bc.token_address?.toLowerCase())
      .filter(Boolean)

    if (tokenAddresses.length === 0) {
      return []
    }

    // Fetch tokens for these bonding curves
    const { data: tokens } = await supabase
      .from('tokens')
      .select('*')
      .in('token_address', tokenAddresses)
      .eq('status', 'active')

    // Get all unique creator addresses from tokens
    const creatorAddresses = Array.from(new Set(tokens?.map(t => t.creator?.toLowerCase()).filter(Boolean) || []))

    // Fetch creator profiles
    let profilesMap = new Map()
    if (creatorAddresses.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('wallet_address, username')
          .in('wallet_address', creatorAddresses)

        if (profiles) {
          profiles.forEach(profile => {
            profilesMap.set(profile.wallet_address.toLowerCase(), {
              username: profile.username || null
            })
          })
        }
      } catch (profileError) {
        // Silently handle - profiles might not exist
      }
    }

    // Create a map of tokens by address
    const tokenMap = new Map()
    tokens?.forEach(token => {
      const creatorProfile = profilesMap.get(token.creator?.toLowerCase()) || null
      tokenMap.set(token.token_address.toLowerCase(), {
        ...token,
        creatorProfile: creatorProfile
      })
    })

    // Combine bonding curves with their tokens
    return bondingCurves.map(bc => {
      const token = tokenMap.get(bc.token_address?.toLowerCase())
      return {
        bonding_curve_address: bc.bonding_curve_address,
        token_address: bc.token_address,
        volume: bc.volume,
        current_price: bc.current_price,
        virtual_eth_lp: bc.virtual_eth_lp,
        virtual_token_lp: bc.virtual_token_lp,
        lp_created: bc.lp_created,
        tokens: token || null
      }
    })
  } catch (error) {
    console.error('Error fetching trending tokens:', error)
    return []
  }
}
