const LAMPORTS_PER_SOL = 1e9
const EVM_PRICE_DIVISOR = 1e15

/**
 * @param {object} opts
 * @param {Array} opts.tokenPriceDatas
 * @param {number} opts.effectiveEthPrice
 * @param {number} opts.tokenPrice
 * @param {boolean} opts.isSolana
 * @param {string|null} opts.timeframe — '1m'|'5m'|'15m'|'1h'|'24h' or null for full history (TradingView advanced chart)
 */
export function transformTokenPriceDatas({
  tokenPriceDatas,
  effectiveEthPrice,
  tokenPrice,
  isSolana,
  timeframe
}) {
  const now = Math.floor(Date.now() / 1000)
  const priceUSD =
    tokenPrice && effectiveEthPrice
      ? isSolana
        ? (LAMPORTS_PER_SOL * effectiveEthPrice) / (Number(tokenPrice) * 1e9)
        : (Number(tokenPrice) * effectiveEthPrice) / EVM_PRICE_DIVISOR
      : 0

  if (!tokenPriceDatas || tokenPriceDatas.length === 0) {
    if (priceUSD > 0) {
      return {
        chartData: [{ time: now, open: priceUSD, high: priceUSD, low: priceUSD, close: priceUSD }],
        volumeData: [{ time: now, value: 0, color: 'rgba(38, 166, 154, 0.3)' }]
      }
    }
    return { chartData: [], volumeData: [] }
  }

  let minTimestamp = 0
  if (timeframe != null) {
    if (timeframe === '1m') minTimestamp = now - 60
    else if (timeframe === '5m') minTimestamp = now - 5 * 60
    else if (timeframe === '15m') minTimestamp = now - 15 * 60
    else if (timeframe === '1h') minTimestamp = now - 3600
    else if (timeframe === '24h') minTimestamp = now - 24 * 3600
  }

  const normalizedData = tokenPriceDatas.map((item) => {
    let ts = item.timestamp
    if (typeof ts === 'string') ts = Number(ts)
    if (ts > 1e12) ts = Math.floor(ts / 1000)
    return { ...item, timestamp: ts }
  })

  let filteredData = normalizedData
    .filter((item) => item.timestamp && item.timestamp >= minTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp)

  if (filteredData.length === 0) {
    const allData = normalizedData.filter((item) => item.timestamp).sort((a, b) => a.timestamp - b.timestamp)
    if (allData.length > 0) {
      filteredData = allData
    } else {
      return { chartData: [], volumeData: [] }
    }
  }

  const data = []
  const volumes = []

  filteredData.forEach((item) => {
    const openPriceWei = Number(item.open_price || item.openPrice || '0')
    const closePriceWei = Number(item.close_price || item.closePrice || '0')
    const amountWei = Number(item.amount || '0')

    const openPriceUSD = isSolana
      ? openPriceWei > 0
        ? (LAMPORTS_PER_SOL * effectiveEthPrice) / (openPriceWei * 1e9)
        : 0
      : (Number(openPriceWei) * effectiveEthPrice) / EVM_PRICE_DIVISOR
    const closePriceUSD = isSolana
      ? closePriceWei > 0
        ? (LAMPORTS_PER_SOL * effectiveEthPrice) / (closePriceWei * 1e9)
        : 0
      : (Number(closePriceWei) * effectiveEthPrice) / EVM_PRICE_DIVISOR
    const amountNative = isSolana ? amountWei / LAMPORTS_PER_SOL : amountWei / 1e18
    const volumeUSD = amountNative * effectiveEthPrice

    if (!isFinite(openPriceUSD) || !isFinite(closePriceUSD) || !isFinite(volumeUSD)) return
    if (openPriceUSD <= 0 || closePriceUSD <= 0) return

    let timestamp = item.timestamp
    if (!timestamp) return
    if (typeof timestamp === 'string') timestamp = Number(timestamp)
    if (timestamp > 1e12) timestamp = Math.floor(timestamp / 1000)
    if (!isFinite(timestamp) || timestamp < 1577836800 || timestamp > 4102444800) return

    const highPriceUSD = Math.max(openPriceUSD, closePriceUSD)
    const lowPriceUSD = Math.min(openPriceUSD, closePriceUSD)

    data.push({
      time: timestamp,
      open: openPriceUSD,
      high: highPriceUSD,
      low: lowPriceUSD,
      close: closePriceUSD
    })

    volumes.push({
      time: timestamp,
      value: volumeUSD > 0 ? volumeUSD : 0,
      color: closePriceUSD >= openPriceUSD ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)'
    })
  })

  return { chartData: data, volumeData: volumes }
}
