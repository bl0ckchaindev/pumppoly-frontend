'use client'
import React from 'react'
import BondingCurveSlider from './BondingCurveSlider'

interface BondingCurve101ModalProps {
  isOpen: boolean
  onClose: () => void
}

const BondingCurve101Modal: React.FC<BondingCurve101ModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#111',
          border: '1px solid #9333EA',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 0 30px rgba(147, 51, 234, 0.4), 0 0 60px rgba(147, 51, 234, 0.15)',
          scrollbarWidth: 'none' as const,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h2 style={{
            color: '#fff',
            margin: 0,
            fontSize: '20px',
            fontWeight: '700',
          }}>
            Bonding Curve 101
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              border: '1px solid #333',
              background: 'transparent',
              color: '#999',
              fontSize: '18px',
              cursor: 'pointer',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#9333EA'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#333'
              e.currentTarget.style.color = '#999'
            }}
          >
            ×
          </button>
        </div>

        {/* 3-Step Explanation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          <StepItem
            number={1}
            color="#4CAF50"
            title="Buy = Price goes up"
            desc="When someone buys tokens, the price automatically increases. Early buyers get lower prices."
          />
          <StepItem
            number={2}
            color="#F44336"
            title="Sell = Price goes down"
            desc="When someone sells tokens, the price automatically decreases. The curve ensures there's always liquidity."
          />
          <StepItem
            number={3}
            color="#9333EA"
            title="The curve sets the price"
            desc="A math formula determines the price based on total supply sold. More demand = higher price. It's automatic and transparent."
          />
        </div>

        {/* Simple Example */}
        <div style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '10px',
          padding: '14px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#9333EA', marginBottom: '8px' }}>
            Quick Example
          </div>
          <p style={{ color: '#ccc', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>
            At <strong style={{ color: '#fff' }}>10% supply sold</strong>, the price might be <strong style={{ color: '#fff' }}>$0.0001</strong>.
            At <strong style={{ color: '#fff' }}>50% supply sold</strong>, the price could rise to <strong style={{ color: '#fff' }}>$0.001</strong> — that&apos;s a 10x increase for early buyers.
          </p>
        </div>

        {/* Interactive Slider */}
        <div style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '10px',
          padding: '14px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#9333EA', marginBottom: '4px' }}>
            Try it — drag the slider
          </div>
          <BondingCurveSlider />
        </div>

        {/* Fee Breakdown */}
        <div style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '10px',
          padding: '14px',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#9333EA', marginBottom: '10px' }}>
            Fee Breakdown (~1% per trade)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <FeeRow label="Creator Rewards" value="0.3%" color="#4CAF50" />
            <FeeRow label="Trader Rewards" value="0.3%" color="#2196F3" />
            <FeeRow label="Platform" value="0.4%" color="#9333EA" />
          </div>
          <p style={{ color: '#888', fontSize: '11px', margin: '10px 0 0', lineHeight: '1.5' }}>
            Fees are taken from each trade automatically. Creator and trader rewards accumulate and can be claimed on-chain.
          </p>
        </div>

        {/* Slippage Note */}
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '10px',
          padding: '14px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '6px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#F59E0B' }}>About Slippage</span>
          </div>
          <p style={{ color: '#ccc', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>
            The final amount you receive may differ slightly from the estimate. Other trades can happen between when you submit and when your trade executes, causing the price to shift. You can set a max slippage tolerance to control this.
          </p>
        </div>
      </div>
    </div>
  )
}

const StepItem: React.FC<{ number: number; color: string; title: string; desc: string }> = ({
  number,
  color,
  title,
  desc,
}) => (
  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
    <div
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        fontWeight: '700',
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {number}
    </div>
    <div>
      <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '2px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: '#999', lineHeight: '1.5' }}>{desc}</div>
    </div>
  </div>
)

const FeeRow: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
      <span style={{ fontSize: '13px', color: '#ccc' }}>{label}</span>
    </div>
    <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{value}</span>
  </div>
)

export default BondingCurve101Modal
