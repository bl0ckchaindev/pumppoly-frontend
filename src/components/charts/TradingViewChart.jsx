import React, { useEffect, useRef, useState, useMemo } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import PropTypes from 'prop-types'
import { formatTokenPriceDisplay } from '../../lib/tokenCalculations'

const LAMPORTS_PER_SOL = 1e9
/** EVM bonding curve: currentTokenPrice() returns (virtualEthLp * 1e15) / virtualTokenLp — same scale as calculateTokenPriceUSD */
const EVM_PRICE_DIVISOR = 1e15

/** Price format for chart axis/tooltip: same as token info page (e.g. 0.000003 → 0.0(5)3, ≥3 decimals shown directly) */
const chartPriceFormat = {
  type: 'custom',
  minMove: 0.000001,
  formatter: (price) => formatTokenPriceDisplay(price)
}

const TradingViewChart = ({ tokenPrice = 0, ethPrice = 0, tokenPriceDatas = [], chartType: initialChartType = 'candlestick', showControls = false, onClick, isMobile = false, defaultExpanded = false, chain = 'evm' }) => {
  const [created, setCreated] = useState(false)
  const newSeries = useRef(null)
  const volumeSeries = useRef(null)
  const chartContainerRef = useRef(null)
  const chart = useRef(null)
  const [chartData, setChartData] = useState([])
  const [volumeData, setVolumeData] = useState([])
  const [timeframe, setTimeframe] = useState('24h')
  const [chartType, setChartType] = useState('candlestick')
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const isDestroyingRef = useRef(false)

  const isSolana = chain === 'solana'
  const effectiveEthPrice = ethPrice && ethPrice > 0 ? ethPrice : (isSolana ? 0 : 3000)

  // Transform price data to chart format. Solana: DB price = token base units per 1 SOL → USD = (1e9 * solPrice) / (tokenPriceFromDB * 1e9)
  const transformPriceData = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    const priceUSD = tokenPrice && effectiveEthPrice
      ? (isSolana ? (LAMPORTS_PER_SOL * effectiveEthPrice) / (Number(tokenPrice) * 1e9) : (Number(tokenPrice) * effectiveEthPrice) / EVM_PRICE_DIVISOR)
      : 0

    // When no history, show current price as a single point so the graph is visible
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
    if (timeframe === '1m') {
      minTimestamp = now - 60
    } else if (timeframe === '5m') {
      minTimestamp = now - 5 * 60
    } else if (timeframe === '15m') {
      minTimestamp = now - 15 * 60
    } else if (timeframe === '1h') {
      minTimestamp = now - 3600
    } else if (timeframe === '24h') {
      minTimestamp = now - 24 * 3600
    }

    const normalizedData = tokenPriceDatas.map(item => {
      let ts = item.timestamp
      if (typeof ts === 'string') ts = Number(ts)
      if (ts > 1e12) ts = Math.floor(ts / 1000)
      return { ...item, timestamp: ts }
    })
    
    let filteredData = normalizedData
      .filter(item => item.timestamp && item.timestamp >= minTimestamp)
      .sort((a, b) => a.timestamp - b.timestamp)

    if (filteredData.length === 0) {
      const allData = normalizedData
        .filter(item => item.timestamp)
        .sort((a, b) => a.timestamp - b.timestamp)
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
        ? (openPriceWei > 0 ? (LAMPORTS_PER_SOL * effectiveEthPrice) / (openPriceWei * 1e9) : 0)
        : (Number(openPriceWei) * effectiveEthPrice) / EVM_PRICE_DIVISOR
      const closePriceUSD = isSolana
        ? (closePriceWei > 0 ? (LAMPORTS_PER_SOL * effectiveEthPrice) / (closePriceWei * 1e9) : 0)
        : (Number(closePriceWei) * effectiveEthPrice) / EVM_PRICE_DIVISOR
      // Solana: amount is in lamports (1e9). EVM: amount is in wei (1e18).
      const amountNative = isSolana ? amountWei / LAMPORTS_PER_SOL : amountWei / 1e18
      const volumeUSD = amountNative * effectiveEthPrice

      if (!isFinite(openPriceUSD) || !isFinite(closePriceUSD) || !isFinite(volumeUSD)) {
        return
      }

      if (openPriceUSD <= 0 || closePriceUSD <= 0) {
        return
      }

      let timestamp = item.timestamp
      if (!timestamp) return
      if (typeof timestamp === 'string') timestamp = Number(timestamp)
      if (timestamp > 1e12) timestamp = Math.floor(timestamp / 1000)
      if (!isFinite(timestamp) || timestamp < 1577836800 || timestamp > 4102444800) {
        return
      }

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
  }, [tokenPriceDatas, timeframe, effectiveEthPrice, tokenPrice, isSolana])

  // Update chart data when transformed data changes
  useEffect(() => {
    if (transformPriceData.chartData.length > 0) {
      setChartData(transformPriceData.chartData)
      setVolumeData(transformPriceData.volumeData)
    } else {
      setChartData([])
      setVolumeData([])
    }
  }, [transformPriceData])

  // Initialize chart
  useEffect(() => {
    isDestroyingRef.current = false
    
    if (!chartContainerRef.current || created) return

    const initChart = () => {
      if (!chartContainerRef.current || created) return

      const containerWidth = chartContainerRef.current.clientWidth || chartContainerRef.current.offsetWidth || 800
      const containerHeight = chartContainerRef.current.clientHeight || chartContainerRef.current.offsetHeight || (isExpanded ? (isMobile ? 300 : 400) : 180)

      if (containerWidth === 0 || containerHeight === 0) {
        setTimeout(initChart, 100)
        return
      }

      const chartOptions = {
        width: containerWidth,
        height: containerHeight,
        layout: {
          backgroundColor: '#111111',
          textColor: '#d1d4dc',
          fontSize: 12,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        },
        grid: {
          vertLines: {
            color: '#333333',
            style: 1,
            visible: true
          },
          horzLines: {
            color: '#333333',
            style: 1,
            visible: true
          }
        },
        crosshair: {
          mode: showControls ? CrosshairMode.Normal : CrosshairMode.Hidden,
          vertLine: {
            color: '#758696',
            width: 1,
            style: 3,
            labelBackgroundColor: '#111111'
          },
          horzLine: {
            color: '#758696',
            width: 1,
            style: 3,
            labelBackgroundColor: '#111111'
          }
        },
        priceScale: {
          borderColor: '#333333',
          scaleMargins: {
            top: 0.1,
            bottom: 0.2
          }
        },
        timeScale: {
          borderColor: '#333333',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          barSpacing: 3
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true
        },
        handleScale: {
          axisPressedMouseMove: false,
          mouseWheel: true,
          pinch: true
        }
      }

      try {
        chart.current = createChart(chartContainerRef.current, chartOptions)
        
        if (!chart.current) {
          setCreated(true)
          return
        }
        
        if (chartType === 'candlestick') {
          newSeries.current = chart.current.addCandlestickSeries({
            upColor: '#18d78c',
            downColor: '#f44336',
            borderVisible: false,
            wickUpColor: '#18d78c',
            wickDownColor: '#f44336',
            priceFormat: chartPriceFormat
          })
        } else if (chartType === 'line') {
          newSeries.current = chart.current.addLineSeries({
            color: '#18d78c',
            lineWidth: 3,
            priceLineVisible: true,
            lastValueVisible: true,
            priceFormat: chartPriceFormat
          })
        }
        
        volumeSeries.current = chart.current.addHistogramSeries({
          color: '#18d78c',
          priceFormat: {
            type: 'volume'
          },
          priceScaleId: '',
          scaleMargins: {
            top: 0.8,
            bottom: 0
          }
        })

        if (newSeries.current) {
          newSeries.current.setData([])
        }
        if (volumeSeries.current) {
          volumeSeries.current.setData([])
        }

        const canvas = chartContainerRef.current.querySelector('canvas')
        if (canvas) {
          canvas.style.display = 'block'
          canvas.style.visibility = 'visible'
          canvas.style.position = 'relative'
          canvas.style.zIndex = '100'
          canvas.style.opacity = '1'
          canvas.style.background = 'transparent'
          canvas.style.pointerEvents = 'auto'
          canvas.style.touchAction = 'none'
          canvas.style.userSelect = 'none'
        }

        setCreated(true)
      } catch (error) {
        console.error('Error initializing chart:', error)
        setCreated(true)
      }
    }

    initChart()

    const handleResize = () => {
      if (chartContainerRef.current && chart.current) {
        const containerWidth = chartContainerRef.current.clientWidth || chartContainerRef.current.offsetWidth || 800
        const containerHeight = chartContainerRef.current.clientHeight || chartContainerRef.current.offsetHeight || (isExpanded ? (isMobile ? 300 : 400) : 180)
        chart.current.applyOptions({
          width: containerWidth,
          height: containerHeight
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      isDestroyingRef.current = true
      if (chart.current) {
        try {
          if (newSeries.current) {
            try {
              chart.current.removeSeries(newSeries.current)
            } catch (e) {
              // Ignore errors
            }
          }
          if (volumeSeries.current) {
            try {
              chart.current.removeSeries(volumeSeries.current)
            } catch (e) {
              // Ignore errors
            }
          }
          chart.current.remove()
        } catch (error) {
          console.error('Error removing chart:', error)
        }
        chart.current = null
        newSeries.current = null
        volumeSeries.current = null
        setCreated(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw chart when expanded state changes
  useEffect(() => {
    if (!created || !chart.current || !chartContainerRef.current) return
    
    const containerWidth = chartContainerRef.current.clientWidth || chartContainerRef.current.offsetWidth || 800
    const containerHeight = isExpanded ? (isMobile ? 300 : 400) : 180
    
    if (chart.current) {
      chart.current.applyOptions({
        width: containerWidth,
        height: containerHeight,
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true
        },
        handleScale: {
          axisPressedMouseMove: false,
          mouseWheel: true,
          pinch: true
        }
      })
      
      // Ensure canvas has proper pointer events when expanded
      setTimeout(() => {
        const canvas = chartContainerRef.current?.querySelector('canvas')
        if (canvas) {
          if (isExpanded) {
            canvas.style.pointerEvents = 'auto'
            canvas.style.touchAction = 'none'
            canvas.style.userSelect = 'none'
            // Remove any event listeners that might interfere
            canvas.style.cursor = 'default'
          } else {
            canvas.style.pointerEvents = 'none'
          }
        }
      }, 100)
    }
  }, [isExpanded, created, isMobile])

  // Handle chart type changes
  useEffect(() => {
    if (isDestroyingRef.current) return
    if (!chart.current || !created || !newSeries.current) return
    if (!chartData || chartData.length === 0) return

    try {
      chart.current.removeSeries(newSeries.current)
      
      if (chartType === 'candlestick') {
        newSeries.current = chart.current.addCandlestickSeries({
          upColor: '#18d78c',
          downColor: '#f44336',
          borderVisible: false,
          wickUpColor: '#18d78c',
          wickDownColor: '#f44336',
          priceFormat: chartPriceFormat
        })
      } else if (chartType === 'line') {
        newSeries.current = chart.current.addLineSeries({
          color: '#18d78c',
          lineWidth: 3,
          priceLineVisible: true,
          lastValueVisible: true,
          priceFormat: chartPriceFormat
        })
      }
      
      if (!newSeries.current) return

      const validData = chartData.filter(d => 
        d && 
        d.time && 
        typeof d.open === 'number' && 
        typeof d.close === 'number' &&
        typeof d.high === 'number' &&
        typeof d.low === 'number' &&
        isFinite(d.open) && 
        isFinite(d.close) &&
        isFinite(d.high) &&
        isFinite(d.low) &&
        d.open > 0 &&
        d.close > 0
      )
      
      if (validData.length > 0 && newSeries.current && chart.current && !isDestroyingRef.current) {
        if (chartType === 'candlestick') {
          newSeries.current.setData(validData)
        } else {
          const lineData = validData.map(d => ({
            time: d.time,
            value: d.close
          }))
          newSeries.current.setData(lineData)
        }
        chart.current.timeScale().fitContent()
      }
    } catch (error) {
      console.error('Error changing chart type:', error)
    }
  }, [chartType, created, chartData])

  // Update chart data
  useEffect(() => {
    if (isDestroyingRef.current) return
    if (!created || !chart.current || !newSeries.current) return
    if (!chartData || chartData.length === 0) return
    
    try {
      const validData = chartData.filter(d => 
        d && 
        d.time && 
        typeof d.open === 'number' && 
        typeof d.close === 'number' &&
        typeof d.high === 'number' &&
        typeof d.low === 'number' &&
        isFinite(d.open) && 
        isFinite(d.close) &&
        isFinite(d.high) &&
        isFinite(d.low) &&
        d.open > 0 &&
        d.close > 0
      )
      
      if (validData.length === 0) return

      if (chartType === 'candlestick') {
        newSeries.current.setData(validData)
      } else {
        const lineData = validData.map(d => ({
          time: d.time,
          value: d.close
        }))
        newSeries.current.setData(lineData)
      }
      
      if (chart.current && !isDestroyingRef.current) {
        chart.current.timeScale().fitContent()
        chart.current.applyOptions({
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true
          },
          handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true
          },
          crosshair: {
            mode: showControls ? CrosshairMode.Normal : CrosshairMode.Hidden
          }
        })
      }
    } catch (error) {
      console.error('Error updating chart data:', error)
    }
  }, [chartData, created, chartType, showControls])

  // Update volume data
  useEffect(() => {
    if (isDestroyingRef.current) return
    if (!created || !chart.current || !volumeSeries.current) return
    if (!volumeData || volumeData.length === 0) return
    
    try {
      const validVolumeData = volumeData.filter(d => 
        d && 
        d.time && 
        typeof d.value === 'number' &&
        isFinite(d.value) &&
        d.value >= 0
      )
      
      if (validVolumeData.length === 0) return

      volumeSeries.current.setData(validVolumeData)
    } catch (error) {
      console.error('Error updating volume data:', error)
    }
  }, [volumeData, created])

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf)
  }

  const handleChartTypeChange = (type) => {
    setChartType(type)
  }

  const timeframeTooltips = {
    '1m': 'Show price for the last 1 minute',
    '5m': 'Show price for the last 5 minutes',
    '15m': 'Show price for the last 15 minutes',
    '1h': 'Show price for the last 1 hour',
    '24h': 'Show price for the last 24 hours'
  }

  return (
    <div style={{ width: '100%', background: '#111111', position: 'relative' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        paddingBottom: '5px',
        borderBottom: '1px solid #2B2B43',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* <span style={{ color: '#758696', fontSize: '12px', marginRight: '4px' }}>Timeframe:</span> */}
          {['1m', '5m', '15m', '1h', '24h'].map(tf => (
            <button
              key={tf}
              onClick={(e) => {
                e.stopPropagation()
                handleTimeframeChange(tf)
              }}
              title={timeframeTooltips[tf]}
              style={{
                padding: '4px 8px',
                background: timeframe === tf ? '#18d78c' : 'transparent',
                border: `1px solid ${timeframe === tf ? '#18d78c' : '#2B2B43'}`,
                borderRadius: '4px',
                color: timeframe === tf ? '#fff' : '#758696',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'uppercase'
              }}
            >
              {tf}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: '15px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleChartTypeChange('candlestick')
            }}
            style={{
              padding: '6px',
              background: chartType === 'candlestick' ? '#18d78c' : 'transparent',
              border: `1px solid ${chartType === 'candlestick' ? '#18d78c' : '#2B2B43'}`,
              borderRadius: '4px',
              color: chartType === 'candlestick' ? '#fff' : '#758696',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px'
            }}
            title="Candlestick chart: shows open, high, low, and close price for each period"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="2" width="2" height="4" fill="currentColor"/>
              <rect x="3" y="8" width="2" height="6" fill="currentColor"/>
              <rect x="9" y="4" width="2" height="4" fill="currentColor"/>
              <rect x="9" y="10" width="2" height="4" fill="currentColor"/>
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleChartTypeChange('line')
            }}
            style={{
              padding: '6px',
              background: chartType === 'line' ? '#18d78c' : 'transparent',
              border: `1px solid ${chartType === 'line' ? '#18d78c' : '#2B2B43'}`,
              borderRadius: '4px',
              color: chartType === 'line' ? '#fff' : '#758696',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px'
            }}
            title="Line chart: shows closing price over time (simplified view)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 12L5 9L8 11L13 4" 
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="5" cy="9" r="1" fill="currentColor"/>
              <circle cx="8" cy="11" r="1" fill="currentColor"/>
              <circle cx="13" cy="4" r="1" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={chartContainerRef}
        onClick={isExpanded ? undefined : onClick}
        style={{
          width: '100%',
          height: isExpanded ? (isMobile ? '300px' : '400px') : '180px',
          minHeight: isExpanded ? (isMobile ? '300px' : '400px') : '180px',
          maxHeight: isExpanded ? (isMobile ? '300px' : '400px') : '180px',
          position: 'relative',
          cursor: onClick && !isExpanded ? 'pointer' : 'default',
          backgroundColor: '#111111',
          overflow: 'hidden',
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          zIndex: 1,
          transition: 'height 0.3s ease',
          pointerEvents: 'auto'
        }}
      >
        {!created && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#758696',
            fontSize: '14px',
            textAlign: 'center',
            zIndex: 1,
            pointerEvents: 'none'
          }}>
            Initializing chart...
          </div>
        )}
        {created && (!chartData || chartData.length === 0) && (!tokenPriceDatas || tokenPriceDatas.length === 0) && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#758696',
            fontSize: '14px',
            textAlign: 'center',
            zIndex: 1,
            pointerEvents: 'none',
            backgroundColor: 'rgba(19, 23, 34, 0.8)',
            padding: '10px 20px',
            borderRadius: '4px'
          }}>
            <div>
              <div style={{ marginBottom: '8px' }}>No trading data available yet</div>
              <div style={{ fontSize: '12px', color: '#5a5d6a' }}>Chart will update when trades occur</div>
            </div>
          </div>
        )}

        {/* Overlay to prevent chart interaction when collapsed */}
        {!isExpanded && (
          <div
          className='overlay-chart'
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

      {/* Expand/Collapse Button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsExpanded(!isExpanded)
        }}
        title={isExpanded ? 'Collapse chart' : 'Expand chart to scroll and zoom; drag to pan, use mouse wheel to zoom'}
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
            <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
  chain: PropTypes.oneOf(['evm', 'solana'])
}

export default TradingViewChart
