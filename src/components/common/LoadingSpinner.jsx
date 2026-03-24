import React from 'react'
import { colors } from '../../lib/styles.ts'

const LoadingSpinner = ({ size = 40, color = colors.text.primary }) => {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      padding: '40px'
    }}>
      <div
        style={{
          width: size,
          height: size,
          border: `4px solid ${colors.border.default}`,
          borderTop: `4px solid ${color}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default LoadingSpinner

