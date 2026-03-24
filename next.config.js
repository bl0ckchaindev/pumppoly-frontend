// Path: next.config.js
const nextConfig = {
  webpack: (config, { isServer, webpack }) => {
    // Handle optional peer dependencies (required for Reown AppKit)
    config.externals = config.externals || []
    if (Array.isArray(config.externals)) {
      config.externals.push(
        'pino-pretty',
        'lokijs',
        'encoding',
        'porto',
        'porto/internal',
        '@react-native-async-storage/async-storage'
        // Note: @coinbase/wallet-sdk and @gemini-wallet/core are now installed
        // and should be available for use with their respective connectors
      )
    }

    config.resolve.alias = {
      ...config.resolve.alias,
      'bigint': require.resolve('bigint/crypto/js'),
    }

    return config
  },
    // Or if you want to be more permissive during development:
    allowedDevOrigins: process.env.NODE_ENV === 'development' ? undefined : ['trollspump.com']

}