import type { FC } from 'react'

export interface TradingHistoryProps {
  tokenAddress: string | null
  chainId?: number | string
  chain?: string
  contractAddress?: string | null
  tokenPriceDatas?: unknown[]
  ethPrice?: number
  tokenSymbol?: string
  showHeader?: boolean
  simplified?: boolean
  maxRows?: number
  onViewAll?: () => void
  /** Increment to trigger a refetch (e.g. after user buys/sells so new trade appears). */
  refreshKey?: number
}

declare const TradingHistory: FC<TradingHistoryProps>
export default TradingHistory
