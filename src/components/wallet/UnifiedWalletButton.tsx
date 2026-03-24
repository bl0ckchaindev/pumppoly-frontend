'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useChain } from '../../lib/context/ChainContext'

const UnifiedWalletButton = () => {
  const { address: evmAddress, isConnected: evmConnected } = useAccount()
  const { publicKey: solanaPublicKey, connected: solanaConnected } = useWallet()
  const { setVisible: setSolanaModalVisible } = useWalletModal()
  const { activeChain, setActiveChain, isWalletConnected, walletAddress, disconnectWallet } = useChain()
  
  const [showMenu, setShowMenu] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Detect desktop for showing text
  useEffect(() => {
    const checkDesktop = () => {
      if (typeof window !== 'undefined') {
        setIsDesktop(window.innerWidth >= 640)
      }
    }
    checkDesktop()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', checkDesktop)
      return () => window.removeEventListener('resize', checkDesktop)
    }
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleOpenEVMWallet = () => {
    setShowMenu(false)
    if (typeof window !== 'undefined') {
      const modal = (window as any).__appKitModal
      if (modal && modal.open) {
        modal.open()
      } else {
        console.warn('AppKit modal not available')
      }
    }
  }

  const handleOpenSolanaWallet = () => {
    setShowMenu(false)
    setSolanaModalVisible(true)
  }

  const handleSwitchToEVM = () => {
    setActiveChain('evm')
    setShowMenu(false)
    // If EVM wallet is not connected, open the connection modal
    if (!evmConnected) {
      setTimeout(() => {
        handleOpenEVMWallet()
      }, 100)
    }
  }

  const handleSwitchToSolana = () => {
    setActiveChain('solana')
    setShowMenu(false)
    // If Solana wallet is not connected, open the connection modal
    if (!solanaConnected) {
      setTimeout(() => {
        handleOpenSolanaWallet()
      }, 100)
    }
  }

  const handleDisconnect = () => {
    disconnectWallet()
    setShowMenu(false)
  }

  const handleWalletClick = () => {
    setShowMenu(!showMenu)
  }

  const getDisplayAddress = () => {
    if (walletAddress) {
      return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    }
    return null
  }

  const displayAddress = getDisplayAddress()
  const chainLabel = activeChain === 'evm' ? 'EVM' : 'SOL'
  const chainColor = activeChain === 'evm' ? 'bg-blue-400' : 'bg-green-400'

  return (
    <div className="relative" ref={menuRef}>
      {/* Main Button */}
      <button
        onClick={handleWalletClick}
        className={`flex items-center justify-center gap-1.5 min-w-0 h-9 min-[400px]:h-10 min-[400px]:gap-2 bg-transparent border border-border rounded-lg transition-all duration-200 overflow-hidden relative md:h-9 sm:h-8 ${
          isWalletConnected
            ? 'px-2 min-[400px]:px-3 border-purple-primary/50 bg-purple-primary/10' 
            : 'px-2 min-[400px]:px-3'
        } hover:border-purple-primary hover:bg-bg-secondary`}
        title={displayAddress || `Connect ${chainLabel} Wallet`}
      >
        {/* Chain indicator */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${chainColor}`} />
        
        {displayAddress ? (
          <>
            <span className="text-white text-xs min-[400px]:text-sm font-medium truncate max-w-[52px] min-[400px]:max-w-[80px] min-[640px]:max-w-[100px]">
              {displayAddress}
            </span>
          </>
        ) : (
          <>
            {isDesktop && (
              <span className="text-white text-sm font-medium">Connect</span>
            )}
          </>
        )}
        
        {/* Dropdown indicator */}
        <svg 
          className="w-3 h-3 text-text-tertiary flex-shrink-0" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a1a] border border-border rounded-lg shadow-lg z-[1001] overflow-hidden">
          {/* Chain Switcher Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="text-text-tertiary text-xs uppercase tracking-wide mb-2">Network</div>
            <div className="flex gap-2">
              <button
                onClick={handleSwitchToEVM}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeChain === 'evm'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-transparent text-text-secondary border border-border hover:border-blue-500/30 hover:text-blue-400'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  EVM
                </div>
              </button>
              <button
                onClick={handleSwitchToSolana}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeChain === 'solana'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                    : 'bg-transparent text-text-secondary border border-border hover:border-green-500/30 hover:text-green-400'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  Solana
                </div>
              </button>
            </div>
          </div>

          {/* Wallet Status */}
          <div className="px-4 py-3">
            {isWalletConnected && walletAddress ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full ${activeChain === 'evm' ? 'bg-blue-500/20' : 'bg-green-500/20'} flex items-center justify-center flex-shrink-0`}>
                      <span className={`text-xs font-bold ${activeChain === 'evm' ? 'text-blue-400' : 'text-green-400'}`}>
                        {chainLabel}
                      </span>
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">Connected</div>
                      <div className="text-text-tertiary text-xs font-mono">
                        {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="w-full py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors border border-red-400/30"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={activeChain === 'evm' ? handleOpenEVMWallet : handleOpenSolanaWallet}
                className="w-full py-3 bg-purple-primary text-white rounded-lg hover:bg-purple-dark transition-colors text-sm font-medium"
              >
                Connect {activeChain === 'evm' ? 'EVM' : 'Solana'} Wallet
              </button>
            )}
          </div>
          
          {/* Network Info */}
          <div className="px-4 py-2 border-t border-border bg-black/20">
            <div className="text-text-tertiary text-xs">
              {activeChain === 'evm' ? 'Base, Sepolia' : 'Solana Devnet'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UnifiedWalletButton
