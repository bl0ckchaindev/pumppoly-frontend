/**
 * Centralized theme and style constants
 */

export const colors = {
  background: {
    primary: '#000',
    secondary: '#111',
    tertiary: '#0a0a0a',
    card: '#111',
    cardHover: '#1a1a1a',
    input: '#222',
  },
  border: {
    default: '#333',
    hover: '#555',
    light: '#222',
  },
  text: {
    primary: '#fff',
    secondary: '#999',
    tertiary: '#ccc',
    success: '#4CAF50',
    error: '#f00',
  },
  button: {
    primary: '#4CAF50',
    primaryHover: '#45a049',
    secondary: '#222',
    secondaryHover: '#333',
    disabled: '#333',
  },
}

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '15px',
  xl: '20px',
  xxl: '30px',
  xxxl: '40px',
}

export const borderRadius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  full: '50%',
}

export const fontSize = {
  xs: '11px',
  sm: '12px',
  md: '14px',
  lg: '16px',
  xl: '18px',
  xxl: '24px',
}

export const commonStyles = {
  card: {
    background: colors.background.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    transition: 'all 0.2s',
  },
  button: {
    primary: {
      padding: `${spacing.md} ${spacing.xxl}`,
      background: colors.button.primary,
      border: 'none',
      borderRadius: borderRadius.lg,
      color: colors.text.primary,
      fontSize: fontSize.lg,
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    secondary: {
      padding: `${spacing.md} ${spacing.xxl}`,
      background: colors.button.secondary,
      border: `1px solid ${colors.border.default}`,
      borderRadius: borderRadius.sm,
      color: colors.text.primary,
      fontSize: fontSize.md,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
  },
  input: {
    width: '100%',
    padding: spacing.md,
    background: colors.background.input,
    border: `1px solid ${colors.border.default}`,
    borderRadius: borderRadius.sm,
    color: colors.text.primary,
    fontSize: fontSize.md,
    outline: 'none',
  },
}

