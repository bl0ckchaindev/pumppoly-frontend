'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'

interface TooltipProps {
  text: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top' }) => {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const tip = tooltipRef.current.getBoundingClientRect()
    let top = 0
    let left = 0

    switch (position) {
      case 'bottom':
        top = rect.bottom + 8
        left = rect.left + rect.width / 2 - tip.width / 2
        break
      case 'left':
        top = rect.top + rect.height / 2 - tip.height / 2
        left = rect.left - tip.width - 8
        break
      case 'right':
        top = rect.top + rect.height / 2 - tip.height / 2
        left = rect.right + 8
        break
      default:
        top = rect.top - tip.height - 8
        left = rect.left + rect.width / 2 - tip.width / 2
    }

    const padding = 8
    if (left < padding) left = padding
    if (left + tip.width > window.innerWidth - padding) left = window.innerWidth - tip.width - padding
    if (top < padding) {
      top = rect.bottom + 8
    }

    setCoords({ top, left })
  }, [position])

  useEffect(() => {
    if (visible) updatePosition()
  }, [visible, updatePosition])

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(true)
  }

  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 100)
  }

  const toggle = () => {
    setVisible(v => !v)
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={toggle}
        style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </span>
      {visible && (
        <div
          ref={tooltipRef}
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 99999,
            padding: '8px 12px',
            background: 'rgba(0, 0, 0, 0.95)',
            border: '1px solid #9333EA',
            borderRadius: '8px',
            color: '#ccc',
            fontSize: '12px',
            lineHeight: '1.5',
            maxWidth: '260px',
            pointerEvents: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 0 15px rgba(147,51,234,0.2)',
            whiteSpace: 'normal',
            wordWrap: 'break-word',
          }}
        >
          {text}
        </div>
      )}
    </>
  )
}

export default Tooltip
