import React, { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { transformTokenPriceDatas } from '../../lib/tokenChartTransform'
import { createPumppolyDatafeed } from '../../lib/tradingViewCustomDatafeed'
import LightweightPriceChart from './LightweightPriceChart.jsx'

const TV_SCRIPT_SRC = '/charting_library/charting_library.standalone.js'
const TV_LIBRARY_PATH = '/charting_library/'

function loadTradingViewScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.TradingView) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pumppoly-tv="1"]')
    if (existing) {
      if (window.TradingView) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('TV script load error')))
      return
    }
    const s = document.createElement('script')
    s.dataset.pumppolyTv = '1'
    s.src = TV_SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('TV script missing'))
    document.head.appendChild(s)
  })
}

const TradingViewChart = ({
  tokenPrice = 0,
  ethPrice = 0,
  tokenPriceDatas = [],
  chartType: initialChartType = 'candlestick',
  showControls = false,
  onClick,
  isMobile = false,
  defaultExpanded = false,
  chain = 'evm',
  chartSymbol = 'TOKEN',
  chartDescription = '',
  preferAdvancedChart = true
}) => {
  const [tvLoadState, setTvLoadState] = useState(() => (preferAdvancedChart ? 'loading' : 'ready'))
  const [useLightweightFallback, setUseLightweightFallback] = useState(() => !preferAdvancedChart)
  const tvContainerRef = useRef(null)
  const widgetRef = useRef(null)
  const seriesRef = useRef({ chartData: [], volumeData: [] })
  const notifyRef = useRef(null)

  const isSolana = chain === 'solana'
  const effectiveEthPrice = ethPrice && ethPrice > 0 ? ethPrice : (isSolana ? 0 : 3000)

  const fullHistorySeries = useMemo(
    () =>
      transformTokenPriceDatas({
        tokenPriceDatas,
        effectiveEthPrice,
        tokenPrice,
        isSolana,
        timeframe: null
      }),
    [tokenPriceDatas, effectiveEthPrice, tokenPrice, isSolana]
  )

  useEffect(() => {
    seriesRef.current = {
      chartData: fullHistorySeries.chartData || [],
      volumeData: fullHistorySeries.volumeData || []
    }
    notifyRef.current?.()
  }, [fullHistorySeries])

  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const chartHeight = isExpanded ? (isMobile ? 300 : 460) : 180

  useEffect(() => {
    if (!preferAdvancedChart) return
    let cancelled = false
    setTvLoadState('loading')
    loadTradingViewScript()
      .then(() => {
        if (!cancelled) {
          setTvLoadState('ready')
          setUseLightweightFallback(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUseLightweightFallback(true)
          setTvLoadState('ready')
        }
      })
    return () => {
      cancelled = true
    }
  }, [preferAdvancedChart])

  useEffect(() => {
    if (useLightweightFallback || tvLoadState !== 'ready') return
    if (typeof window === 'undefined' || !window.TradingView) return
    const el = tvContainerRef.current
    if (!el) return

    const displayTicker = String(chartSymbol || 'TOKEN').replace(/[^a-zA-Z0-9._-]/g, '') || 'TOKEN'
    const { datafeed, notifyUpdate } = createPumppolyDatafeed({
      getSnapshot: () => seriesRef.current,
      symbolTicker: displayTicker,
      description: chartDescription || displayTicker
    })
    notifyRef.current = notifyUpdate

    const disabledFeatures = [
      'use_localstorage_for_settings',
      'save_chart_properties_to_local_storage',
      'header_compare',
      'compare_symbol',
      'header_symbol_search',
      'symbol_search_hot_key'
    ]

    let widget
    try {
      widget = new window.TradingView.widget({
        symbol: displayTicker,
        interval: '5',
        container: el,
        library_path: TV_LIBRARY_PATH,
        locale: 'en',
        disabled_features: disabledFeatures,
        enabled_features: ['study_templates'],
        client_id: 'pumppoly.local',
        user_id: 'public',
        fullscreen: false,
        autosize: true,
        theme: 'dark',
        datafeed,
        loading_screen: { backgroundColor: '#111111' },
        overrides: {
          'paneProperties.background': '#111111',
          'paneProperties.backgroundType': 'solid',
          'paneProperties.vertGridProperties.color': '#2B2B43',
          'paneProperties.horzGridProperties.color': '#2B2B43',
          'scalesProperties.textColor': '#d1d4dc',
          'mainSeriesProperties.candleStyle.upColor': '#18d78c',
          'mainSeriesProperties.candleStyle.downColor': '#f44336',
          'mainSeriesProperties.candleStyle.borderUpColor': '#18d78c',
          'mainSeriesProperties.candleStyle.borderDownColor': '#f44336',
          'mainSeriesProperties.candleStyle.wickUpColor': '#18d78c',
          'mainSeriesProperties.candleStyle.wickDownColor': '#f44336'
        }
      })
    } catch (e) {
      console.error('TradingView widget error:', e)
      setUseLightweightFallback(true)
      return
    }

    widgetRef.current = widget

    widget.onChartReady(() => {
      try {
        if (initialChartType === 'line' && widget.chart) {
          widget.chart().setChartType(2)
        }
      } catch (_) {
        /* ignore */
      }
    })

    return () => {
      notifyRef.current = null
      widgetRef.current = null
      try {
        widget.remove()
      } catch (_) {
        /* ignore */
      }
    }
  }, [
    useLightweightFallback,
    tvLoadState,
    chartSymbol,
    chartDescription,
    initialChartType,
    isExpanded,
    isMobile
  ])

  useEffect(() => {
    if (useLightweightFallback || !widgetRef.current) return
    try {
      widgetRef.current.chart().resetData()
    } catch (_) {
      /* ignore */
    }
  }, [fullHistorySeries, useLightweightFallback])

  if (useLightweightFallback) {
    return (
      <LightweightPriceChart
        tokenPrice={tokenPrice}
        ethPrice={ethPrice}
        tokenPriceDatas={tokenPriceDatas}
        chartType={initialChartType}
        showControls={showControls}
        onClick={onClick}
        isMobile={isMobile}
        defaultExpanded={defaultExpanded}
        chain={chain}
      />
    )
  }

  const noDataYet =
    (!fullHistorySeries.chartData || fullHistorySeries.chartData.length === 0) &&
    (!tokenPriceDatas || tokenPriceDatas.length === 0)

  return (
    <div style={{ width: '100%', background: '#111111', position: 'relative' }}>
      <div
        ref={tvContainerRef}
        onClick={isExpanded ? undefined : onClick}
        style={{
          width: '100%',
          height: `${chartHeight}px`,
          minHeight: `${chartHeight}px`,
          position: 'relative',
          cursor: onClick && !isExpanded ? 'pointer' : 'default',
          backgroundColor: '#111111',
          overflow: 'hidden'
        }}
      >
        {tvLoadState === 'loading' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#758696',
              fontSize: '14px',
              zIndex: 2,
              pointerEvents: 'none',
              background: '#111'
            }}
          >
            Loading chart…
          </div>
        )}
        {noDataYet && tvLoadState === 'ready' && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#758696',
              fontSize: '14px',
              textAlign: 'center',
              zIndex: 3,
              pointerEvents: 'none',
              backgroundColor: 'rgba(17, 17, 17, 0.85)',
              padding: '10px 20px',
              borderRadius: '4px'
            }}
          >
            <div style={{ marginBottom: '8px' }}>No trading data available yet</div>
            <div style={{ fontSize: '12px', color: '#5a5d6a' }}>Chart will update when trades occur</div>
          </div>
        )}
        {!isExpanded && (
          <div
            className="overlay-chart"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'transparent',
              zIndex: 50,
              pointerEvents: 'auto',
              cursor: 'default'
            }}
          />
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsExpanded(!isExpanded)
        }}
        title={
          isExpanded
            ? 'Collapse chart'
            : 'Expand chart for TradingView tools, intervals, and indicators'
        }
        style={{
          position: 'absolute',
          bottom: isMobile ? '8px' : '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(17, 17, 17, 0.9)',
          border: '1px solid #9333EA',
          borderRadius: '20px',
          padding: '6px 12px',
          color: '#d1d4dc',
          fontSize: '11px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          zIndex: 100,
          transition: 'all 0.2s',
          backdropFilter: 'blur(8px)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(147, 51, 234, 0.2)'
          e.currentTarget.style.borderColor = '#18d78c'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(17, 17, 17, 0.9)'
          e.currentTarget.style.borderColor = '#9333EA'
        }}
      >
        <span>{isExpanded ? 'Tap to collapse' : 'Tap to expand'}</span>
        {isExpanded ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M18 15l-6-6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  )
}

TradingViewChart.propTypes = {
  tokenPrice: PropTypes.number,
  ethPrice: PropTypes.number,
  tokenPriceDatas: PropTypes.array,
  chartType: PropTypes.oneOf(['candlestick', 'line', 'area']),
  showControls: PropTypes.bool,
  onClick: PropTypes.func,
  isMobile: PropTypes.bool,
  defaultExpanded: PropTypes.bool,
  chain: PropTypes.string,
  chartSymbol: PropTypes.string,
  chartDescription: PropTypes.string,
  preferAdvancedChart: PropTypes.bool
}

export default TradingViewChart
