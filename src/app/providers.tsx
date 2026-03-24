'use client'

import { wagmiAdapter, projectId, networks } from '../lib/config'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit'
import React, { type ReactNode } from 'react'
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi'
import { Toaster } from 'react-hot-toast'
import { SolanaWalletProvider } from '../lib/solana/wallet'
import { ChainProvider } from '../lib/context/ChainContext'

// Set up queryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

if (!projectId) {
  throw new Error('Project ID is not defined')
}

// Set up metadata
const metadata = {
  name: 'PumpPoly',
  description: 'PumpPoly | Base Network Meme Coin Launchpad',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://trollspump.fun',
  icons: [`${typeof window !== 'undefined' ? window.location.origin : ''}/img/logo.png`]
}

// Create the modal (this should only run once on client side)
if (typeof window !== 'undefined' && !(window as any).__appKitInitialized) {
  try {
    const appKit = createAppKit({
      adapters: [wagmiAdapter],
      projectId,
      networks: networks as any, // Networks are already configured in wagmiAdapter
      defaultNetwork: networks[0] as any, // base
      metadata: metadata,
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#9333ea',
        '--w3m-border-radius-master': '1px',
        '--w3m-z-index': 100001,
        '--apkt-z-index': 100001,
      },
      features: {
        analytics: true // Optional - defaults to your Cloud configuration
      }
    })
    ;(window as any).__appKitInitialized = true
    ;(window as any).__appKitModal = appKit
  } catch (error) {
    console.warn('AppKit initialization error:', error)
  }
}

function Providers({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies)

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <SolanaWalletProvider>
        <QueryClientProvider client={queryClient}>
          <ChainProvider>
          {children}
          </ChainProvider>
          <Toaster
            position="top-right"
            reverseOrder={true}
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1a1a1a',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '14px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              },
              success: {
                iconTheme: {
                  primary: '#4CAF50',
                  secondary: '#fff',
                },
                style: {
                  background: '#1a1a1a',
                  border: '1px solid #4CAF50',
                },
              },
              error: {
                iconTheme: {
                  primary: '#f44336',
                  secondary: '#fff',
                },
                style: {
                  background: '#1a1a1a',
                  border: '1px solid #f44336',
                },
              },
            }}
          />
        </QueryClientProvider>
      </SolanaWalletProvider>
    </WagmiProvider>
  )
}

export default Providers
