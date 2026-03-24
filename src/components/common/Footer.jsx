import React from 'react'

const Footer = () => {
  return (
    <footer style={{
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(10px)',
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '10px',
      borderTop: '1px solid #333',
      zIndex: 100
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>
          © 2026 PumpPoly. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

export default Footer