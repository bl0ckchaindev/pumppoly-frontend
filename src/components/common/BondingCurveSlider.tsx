'use client'
import React, { useState } from 'react'

const BondingCurveSlider: React.FC = () => {
  const [supplyPercent, setSupplyPercent] = useState(10)

  const basePrice = 0.000001
  const price = basePrice * Math.pow(supplyPercent / 100, 2) * 10000

  const formatPrice = (p: number) => {
    if (p < 0.0001) return `$${p.toFixed(8)}`
    if (p < 0.01) return `$${p.toFixed(6)}`
    if (p < 1) return `$${p.toFixed(4)}`
    return `$${p.toFixed(2)}`
  }

  const barWidth = supplyPercent

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        fontSize: '13px'
      }}>
        <span style={{ color: '#999' }}>Supply sold: <strong style={{ color: '#fff' }}>{supplyPercent}%</strong></span>
        <span style={{ color: '#999' }}>Price: <strong style={{ color: '#9333EA' }}>{formatPrice(price)}</strong></span>
      </div>

      {/* Visual curve bar */}
      <div style={{
        width: '100%',
        height: '32px',
        background: '#1a1a1a',
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative',
        marginBottom: '8px',
        border: '1px solid #333'
      }}>
        <div style={{
          width: `${barWidth}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #9333EA 0%, #ec4899 100%)',
          borderRadius: '8px 0 0 8px',
          transition: 'width 0.15s ease',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '11px',
            fontWeight: '700',
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            display: barWidth > 15 ? 'block' : 'none'
          }}>
            {formatPrice(price)}
          </div>
        </div>
      </div>

      <input
        type="range"
        min={1}
        max={100}
        value={supplyPercent}
        onChange={e => setSupplyPercent(Number(e.target.value))}
        style={{
          width: '100%',
          accentColor: '#9333EA',
          cursor: 'pointer',
          height: '6px',
        }}
      />

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '10px',
        color: '#666',
        marginTop: '4px'
      }}>
        <span>1% supply</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      <p style={{
        fontSize: '11px',
        color: '#666',
        marginTop: '10px',
        fontStyle: 'italic',
        textAlign: 'center'
      }}>
        Example only — actual prices vary based on the token&apos;s curve parameters.
      </p>
    </div>
  )
}

export default BondingCurveSlider
