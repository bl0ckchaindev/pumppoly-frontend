import React from 'react'
import PropTypes from 'prop-types'
import { colors, fontSize } from '../../lib/styles.ts'

const EmptyState = ({ message = 'No data found', icon = null }) => {
  return (
    <div style={{
      textAlign: 'center',
      color: colors.text.secondary,
      padding: '40px',
      fontSize: fontSize.md
    }}>
      {icon && <div style={{ marginBottom: '10px', fontSize: '48px' }}>{icon}</div>}
      <p style={{ margin: 0 }}>{message}</p>
    </div>
  )
}

EmptyState.propTypes = {
  message: PropTypes.string,
  icon: PropTypes.node,
}

export default EmptyState

