'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'

export type ActiveChain = 'evm' | 'solana'

interface ChainContextType {
  activeChain: ActiveChain
  setActiveChain: (chain: ActiveChain) => void
  switchToEVM: () => void
  switchToSolana: () => void
  isWalletConnected: boolean
  walletAddress: string | null
  disconnectWallet: () => void
}

const ChainContext = createContext<ChainContextType | undefined>(undefined)

export const ChainProvider = ({ children }: { children: ReactNode }) => {
  const { address: evmAddress, isConnected: evmConnected } = useAccount()
  const { disconnect: disconnectEVM } = useDisconnect()
  const { publicKey: solanaPublicKey, connected: solanaConnected, disconnect: disconnectSolana } = useWallet()
  
  // Initialize active chain based on which wallet is connected, or default to 'evm'
  const [activeChain, setActiveChainState] = useState<ActiveChain>('evm')
  
  // Sync active chain with wallet connection state
  useEffect(() => {
    // If Solana is connected and EVM is not, switch to Solana
    if (solanaConnected && !evmConnected) {
      setActiveChainState('solana')
    }
    // If EVM is connected and Solana is not, switch to EVM
    else if (evmConnected && !solanaConnected) {
      setActiveChainState('evm')
    }
    // If both are disconnected, keep current chain selection
  }, [evmConnected, solanaConnected])
  
  const setActiveChain = useCallback((chain: ActiveChain) => {
    setActiveChainState(chain)
    // When switching chains, disconnect the other wallet
    if (chain === 'evm' && solanaConnected) {
      disconnectSolana()
    } else if (chain === 'solana' && evmConnected) {
      disconnectEVM()
    }
  }, [evmConnected, solanaConnected, disconnectEVM, disconnectSolana])
  
  const switchToEVM = useCallback(() => {
    setActiveChain('evm')
  }, [setActiveChain])
  
  const switchToSolana = useCallback(() => {
    setActiveChain('solana')
  }, [setActiveChain])
  
  const disconnectWallet = useCallback(() => {
    if (activeChain === 'evm' && evmConnected) {
      disconnectEVM()
    } else if (activeChain === 'solana' && solanaConnected) {
      disconnectSolana()
    }
  }, [activeChain, evmConnected, solanaConnected, disconnectEVM, disconnectSolana])
  
  // Get current wallet connection status and address based on active chain
  const isWalletConnected = activeChain === 'evm' ? evmConnected : solanaConnected
  const walletAddress = activeChain === 'evm' 
    ? (evmAddress || null) 
    : (solanaPublicKey?.toBase58() || null)
  
  return (
    <ChainContext.Provider value={{
      activeChain,
      setActiveChain,
      switchToEVM,
      switchToSolana,
      isWalletConnected,
      walletAddress,
      disconnectWallet
    }}>
      {children}
    </ChainContext.Provider>
  )
}

export const useChain = () => {
  const context = useContext(ChainContext)
  if (context === undefined) {
    throw new Error('useChain must be used within a ChainProvider')
  }
  return context
}

export default ChainContext
