const path = require('path')

// Packages that some wallet SDKs transitively import but aren't installed / aren't needed client-side.
// IMPORTANT: never push scoped package names (e.g. @scope/pkg) as plain strings to config.externals —
// webpack uses them as JS global variable names, and @ / / produce an invalid-identifier SyntaxError
// in the browser bundle. Use resolve.alias → empty stub on the client instead.
const OPTIONAL_PACKAGES = [
  'pino-pretty',
  'lokijs',
  'encoding',
  '@react-native-async-storage/async-storage',
]

const nextConfig = {
  distDir: 'dist',
  output: 'export',
  poweredByHeader: false,
  reactStrictMode: true,
  compiler: {
    // Strip console.log/debug/info in production; keep warn/error for observability
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Server: CommonJS require() is valid for any string, including scoped packages
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        ...OPTIONAL_PACKAGES,
        'porto',
        'porto/internal',
      ]
    } else {
      // Client: alias missing optional packages to an empty stub module.
      // String externals for scoped packages generate invalid JS identifiers in the browser bundle.
      const emptyModule = path.resolve(__dirname, 'src/lib/empty-module.js')
      config.resolve.alias = {
        ...config.resolve.alias,
        ...Object.fromEntries(OPTIONAL_PACKAGES.map(pkg => [pkg, emptyModule])),
      }
    }

    return config
  },
  allowedDevOrigins: process.env.NODE_ENV === 'development' ? undefined : ['pumppoly.com'],
}

module.exports = nextConfig
