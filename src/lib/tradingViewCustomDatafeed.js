/**
 * TradingView Charting Library custom datafeed backed by in-memory OHLCV (USD).
 * Bar `time` is Unix seconds (UTC), as required by the library.
 */

const SUPPORTED_RESOLUTIONS = ['1', '5', '15', '60', '240', '1D']

function resolutionToMinutes(resolution) {
  const r = String(resolution)
  if (r === 'D' || r === '1D') return 24 * 60
  const n = parseInt(r, 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function aggregateBars(rawBars, rawVolumes, resolution) {
  const bucketSec = resolutionToMinutes(resolution) * 60
  if (!rawBars.length) return []

  const volByTime = new Map()
  ;(rawVolumes || []).forEach((v) => {
    if (v && typeof v.time === 'number') volByTime.set(v.time, (volByTime.get(v.time) || 0) + (v.value || 0))
  })

  const buckets = new Map()
  for (const b of rawBars) {
    if (!b || typeof b.time !== 'number') continue
    const t = Math.floor(b.time / bucketSec) * bucketSec
    const vol = volByTime.get(b.time) || 0
    if (!buckets.has(t)) {
      buckets.set(t, {
        time: t,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: vol
      })
    } else {
      const agg = buckets.get(t)
      agg.high = Math.max(agg.high, b.high)
      agg.low = Math.min(agg.low, b.low)
      agg.close = b.close
      agg.volume += vol
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time)
}

/**
 * @param {object} opts
 * @param {() => { chartData: Array, volumeData: Array }} opts.getSnapshot
 * @param {string} opts.symbolTicker
 * @param {string} [opts.description]
 */
export function createPumppolyDatafeed({ getSnapshot, symbolTicker, description }) {
  const subscribers = new Map()

  const configurationData = {
    supported_resolutions: SUPPORTED_RESOLUTIONS,
    supports_group_request: false,
    supports_marks: false,
    supports_search: false,
    supports_time: true
  }

  function barsForRequest(resolution, fromSec, toSec) {
    const { chartData: rawBars, volumeData: rawVolumes } = getSnapshot()
    const aggregated = aggregateBars(rawBars || [], rawVolumes || [], resolution)
    return aggregated.filter((b) => b.time >= fromSec && b.time <= toSec)
  }

  return {
    datafeed: {
      onReady: (callback) => {
        setTimeout(() => callback(configurationData), 0)
      },
      searchSymbols: (_userInput, _exchange, _symbolType, onResult) => {
        onResult([])
      },
      resolveSymbol: (symbolName, onResolve, onError) => {
        setTimeout(() => {
          try {
            onResolve({
              name: symbolName,
              ticker: symbolName,
              description: description || symbolName,
              type: 'crypto',
              session: '24x7',
              timezone: 'Etc/UTC',
              minmov: 1,
              pricescale: 100000000000,
              has_intraday: true,
              has_daily: true,
              visible_plots_set: 'ohlcv',
              data_status: 'streaming',
              format: 'price',
              supported_resolutions: SUPPORTED_RESOLUTIONS
            })
          } catch (e) {
            onError(String(e))
          }
        }, 0)
      },
      getBars: (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
        try {
          const { from, to } = periodParams
          const bars = barsForRequest(resolution, from, to).map((b) => ({
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume != null ? b.volume : 0
          }))
          if (!bars.length) {
            onHistoryCallback([], { noData: true })
          } else {
            onHistoryCallback(bars, { noData: false })
          }
        } catch (e) {
          onErrorCallback(String(e))
        }
      },
      subscribeBars: (symbolInfo, resolution, onRealtimeCallback, listenerGuid) => {
        subscribers.set(listenerGuid, { resolution, onRealtimeCallback })
      },
      unsubscribeBars: (listenerGuid) => {
        subscribers.delete(listenerGuid)
      }
    },

    /** Call when OHLCV snapshot updates (new trades). */
    notifyUpdate() {
      const { chartData: rawBars, volumeData: rawVolumes } = getSnapshot()
      for (const [, { resolution, onRealtimeCallback }] of subscribers) {
        const agg = aggregateBars(rawBars || [], rawVolumes || [], resolution)
        if (agg.length) {
          const b = agg[agg.length - 1]
          onRealtimeCallback({
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume != null ? b.volume : 0
          })
        }
      }
    }
  }
}
