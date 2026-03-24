/**
 * Formatting utility functions
 */

/**
 * Format market cap as "$X.XK" or "$X.XM" format
 * @param cap - Market cap value
 * @returns Formatted string (e.g., "$1.5M", "$500.0K", "$100")
 */
export const formatMarketCap = (cap: number): string => {
  if (cap >= 1000000) {
    return `$${(cap / 1000000).toFixed(1)}M`
  } else if (cap >= 1000) {
    return `$${(cap / 1000).toFixed(1)}K`
  }
  return `$${cap.toFixed(0)}`
}

/**
 * Format number with k, m, b suffixes
 * @param num - Number to format
 * @returns Formatted string (e.g., "1.50M", "5.00K", "0.000123")
 */
export const formatNumberWithSuffix = (num: number): string => {
  if (num === 0) return '0'
  const absNum = Math.abs(num)
  
  if (absNum >= 1000000000) {
    return (num / 1000000000).toFixed(2) + 'B'
  } else if (absNum >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M'
  } else if (absNum >= 1000) {
    return (num / 1000).toFixed(2) + 'K'
  } else if (absNum >= 1) {
    return num.toFixed(4)
  } else {
    return num.toFixed(6)
  }
}

/**
 * Format creation time as relative time (e.g., "5m ago", "2h ago", "3d ago")
 * or absolute date if older than a week
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted time string
 */
export const formatCreateTime = (timestamp: number | undefined | null): string => {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
  })
}

/**
 * Format trade date as relative time (e.g., "5m ago", "2h ago", "3d ago", "2mo ago")
 * or absolute date if older than a year
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted time string
 */
export const formatTradeDate = (timestamp: number | undefined | null): string => {
  if (!timestamp) return 'just now'
  const date = Math.floor(Date.now() / 1000) - (timestamp || 0)
  
  const oneYear = 31536000 // seconds in a year
  
  if (date > oneYear) {
    // For dates older than a year, show actual date
    const dateObj = new Date((timestamp || 0) * 1000)
    return dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  } else if (date > 2592000) {
    // More than 30 days (1 month)
    const months = Math.floor(date / 2592000)
    return `${months}mo ago`
  } else if (date > 86400) {
    // More than 1 day
    const days = Math.floor(date / 86400)
    return `${days}d ago`
  } else if (date > 3600) {
    // More than 1 hour
    const hours = Math.floor(date / 3600)
    return `${hours}h ago`
  } else if (date > 60) {
    // More than 1 minute
    const minutes = Math.floor(date / 60)
    return `${minutes}m ago`
  } else if (date > 0) {
    return `${date}s ago`
  }
  return 'just now'
}

/**
 * Format trade date as full date and time
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date and time string
 */
export const formatTradeDateFull = (timestamp: number | undefined | null): string => {
  if (!timestamp) return ''
  const dateObj = new Date((timestamp || 0) * 1000)
  return dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}