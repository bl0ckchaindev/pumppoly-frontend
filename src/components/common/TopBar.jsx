'use client'
import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import UnifiedWalletButton from '../wallet/UnifiedWalletButton'
import FeeDisplay from './FeeDisplay'
import { useChain } from '../../lib/context/ChainContext'
// Logo path for Next.js (served from public folder)
const logo = '/icons/logo.png'

const TopBar = () => {
  const { isWalletConnected, walletAddress } = useChain()
  const [isDesktop, setIsDesktop] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showFeesModal, setShowFeesModal] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    // Check window size on mount (client-side only)
    const checkDesktop = () => {
      if (typeof window !== 'undefined') {
        setIsDesktop(window.innerWidth >= 1024)
      }
    }

    checkDesktop()

    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setIsDesktop(window.innerWidth >= 1024)
        // Close menu when resizing to desktop
        if (window.innerWidth >= 768) {
          setMenuOpen(false)
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div className="fixed top-0 left-0 right-0 bg-black/70 backdrop-blur-[10px] px-2 py-2 flex justify-between items-center z-[1000] border-b border-border/50 min-w-0 min-[400px]:px-4 min-[640px]:px-5 min-[640px]:py-2.5">
      {/* Left: Logo */}
      <Link href="/" className="flex items-center gap-1.5 min-w-0 no-underline flex-shrink-0 min-[400px]:gap-2">
        {isDesktop ? (
          <img src="/img/wide logo.png" alt="PumpPoly" className="h-10 object-contain lg:h-8 sm:h-7" />
        ) : (
          <>
            <img src={logo} alt="PumpPoly" className="w-6 h-6 object-contain flex-shrink-0 min-[400px]:w-7 min-[400px]:h-7 min-[640px]:w-8 min-[640px]:h-8" />
            <span className="text-base font-bold bg-gradient-purple-pink bg-clip-text text-transparent truncate min-[400px]:text-lg min-[640px]:text-xl">
              PumpPoly
            </span>
          </>
        )}
      </Link>

      {/* Right: Desktop (md+) - Create, Fees, Wallet, Profile */}
      <div className="hidden md:flex items-center gap-3 flex-shrink-0 md:gap-2 sm:gap-1.5">
        <Link
          href="/create"
          className="flex items-center justify-center px-4 py-2 bg-purple-primary border-none rounded-lg text-white cursor-pointer transition-all duration-200 no-underline text-sm font-medium hover:bg-purple-dark hover:-translate-y-0.5 md:px-4 md:py-2.5 md:text-xs sm:px-3.5 sm:py-1.5 sm:text-xs"
        >
          Create
        </Link>
        <FeeDisplay />
        <UnifiedWalletButton />
        {isWalletConnected && walletAddress && (
          <Link
            href="/profile"
            className="flex items-center justify-center w-10 h-10 bg-transparent border border-border rounded-lg text-white cursor-pointer transition-all duration-200 no-underline md:w-9 md:h-9 sm:w-8 sm:h-8 hover:border-purple-primary hover:bg-bg-secondary"
            title="Profile"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-5 h-5 md:w-[18px] md:h-[18px] sm:w-4 sm:h-4"
              suppressHydrationWarning
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>
        )}
      </div>

      {/* Right: Mobile (< md) - Wallet + Menu */}
      <div className="flex md:hidden items-center gap-1.5 flex-shrink-0 min-[400px]:gap-2" ref={menuRef}>
        <UnifiedWalletButton />
        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center gap-1.5 min-w-9 h-9 min-[400px]:min-w-10 min-[400px]:h-10 px-2 bg-transparent border border-border rounded-lg text-white cursor-pointer transition-all duration-200 hover:border-purple-primary hover:bg-bg-secondary flex-shrink-0"
            title="Menu / Navigation — Explore, Create, Fees, Profile"
            aria-label="Open menu / navigation"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-5 h-5 flex-shrink-0"
              suppressHydrationWarning
            >
              {menuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <>
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
            <span className="text-sm font-medium text-white whitespace-nowrap tracking-tight" aria-hidden="true">
              Menu
            </span>
          </button>

          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-48 bg-black/95 border border-purple-primary/50 rounded-lg shadow-lg z-50 overflow-hidden"
              style={{ boxShadow: '0 0 20px rgba(147, 51, 234, 0.3)' }}
              role="menu"
              aria-label="Navigation menu"
            >
              <p className="px-4 pt-3 pb-1.5 text-xs uppercase tracking-wider text-text-secondary font-medium border-b border-border/50" role="presentation">
                Navigation
              </p>
              <Link
                href="/list"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-3 text-white text-sm hover:bg-purple-primary/20 transition-colors no-underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" /> 
                </svg>
                Explore Tokens
              </Link>
              <Link
                href="/create"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-3 text-white text-sm hover:bg-purple-primary/20 transition-colors no-underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Create
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowFeesModal(true)
                  setMenuOpen(false)
                }}
                className="w-full flex items-center gap-2 px-4 py-3 text-white text-sm hover:bg-purple-primary/20 transition-colors text-left border-none bg-transparent cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                Fees
              </button>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-3 text-white text-sm hover:bg-purple-primary/20 transition-colors no-underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Profile
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Fees Modal (mobile) - portal to body for proper centering */}
      {showFeesModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/90 z-[10001] flex items-center justify-center p-4"
          style={{ top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => setShowFeesModal(false)}
        >
          <div
            className="bg-bg-secondary border border-purple-primary/50 rounded-xl shadow-lg overflow-hidden max-w-[320px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b border-purple-primary/30 bg-purple-primary/10">
              <h2 className="text-white m-0 text-lg font-semibold">Fees</h2>
              <button
                type="button"
                onClick={() => setShowFeesModal(false)}
                className="w-8 h-8 border-none bg-transparent text-text-secondary text-2xl cursor-pointer rounded-full flex items-center justify-center transition-all duration-200 leading-none hover:bg-border hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="p-4 flex justify-center">
              <FeeDisplay contentOnly />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default TopBar
