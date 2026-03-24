/* global BigInt */
import React, { useState, useEffect, memo, useRef, useMemo } from 'react'
import PropTypes from 'prop-types'
import { useAccount } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { readContract, writeContract } from '@wagmi/core'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { getAddress } from 'viem'
import { toast } from 'react-hot-toast'

/** V1: Short toasts for success; detailed errors only for tx rejected, insufficient balance, wrong network */
function getToastErrorMessage(err) {
  const msg = (err?.message ?? err?.transactionMessage ?? err?.toString?.() ?? '').toString().toLowerCase()
  if (msg.includes('reject') || msg.includes('denied') || msg.includes('user denied') || msg.includes('user rejected')) {
    return 'Transaction rejected'
  }
  if (msg.includes('insufficient') || msg.includes('balance')) {
    return err?.message || 'Insufficient balance'
  }
  if (msg.includes('wrong network') || msg.includes('chainid') || (msg.includes('network') && msg.includes('switch'))) {
    return 'Wrong network. Switch to the correct chain.'
  }
  return 'Transaction failed'
}
import { web3Clients, coinNames, SOLANA_CHAIN, SOLANA_PROGRAM_ID, SOLANA_RPC_URL } from '../../lib/constants.ts'
import { apiService } from '../../lib/api.ts'
import { getRouterAddress } from '../../lib/addressHelpers.ts'
import { config } from '../../lib/config.jsx'
import ChadAbi from '../../lib/abis/BondingCurveABI.json'
import TokenAbi from '../../lib/abis/TokenABI.json'
import Tooltip from '../common/Tooltip'
import './SwapCard.css'
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor'
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'

/** Poll until transaction is confirmed or timeout. Does not rely on blockhash from after send. */
async function waitForSignatureConfirmation(connection, signature, commitment = 'confirmed', timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await connection.getSignatureStatus(signature)
    if (status.value) {
      if (status.value.err) {
        const err = new Error(status.value.err?.toString?.() || 'Transaction failed on chain')
        err.transactionMessage = status.value.err?.toString?.()
        throw err
      }
      const statusStr = status.value.confirmationStatus || status.value.confirmations
      if (statusStr === 'confirmed' || statusStr === 'finalized') {
        return
      }
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('Transaction confirmation timeout')
}

const SwapCard = ({
  tokenSymbol,
  tokenLogo,
  tokenAddress,
  bondingCurveAddress,
  effectiveChainId,
  chain = 'evm',
  lpCreated,
  accountBalance,
  tokenBalance,
  tokenAllowance,
  setTokenAllowance,
  refAddress,
  refetchBalance,
  setTokenBalance,
  initialMode = 'buy',
  onSwapSuccess
}) => {
  const { address, isConnected, chainId: connectedChainId } = useAccount()
  const { publicKey: solanaPublicKey, connected: solanaConnected, signTransaction } = useWallet()
  const { setVisible: setSolanaModalVisible } = useWalletModal()
  const isSolana = chain === SOLANA_CHAIN
  const baseCurrency = isSolana ? 'SOL' : 'ETH'
  const nativeCurrencyLabel = isSolana ? 'SOL' : (coinNames[Number(effectiveChainId)] || 'ETH')
  // Initialize inputToken based on initialMode: 'buy' = 'ETH'/'SOL', 'sell' = 'Token'
  const [inputToken, setInputToken] = useState(initialMode === 'sell' ? 'Token' : baseCurrency)
  const [tokenAmount, setTokenAmount] = useState('')
  const [tokenOutAmount, setTokenOutAmount] = useState(0)
  const [creating, setCreating] = useState(false)
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(false)
  const isSwitchingRef = useRef(false)
  const solanaSendingRef = useRef(false)

  const connection = new Connection(SOLANA_RPC_URL, 'confirmed')

  const switchTokens = () => {
    // Prevent rapid successive calls that can cause state desync
    if (isSwitchingRef.current) return
    isSwitchingRef.current = true
    
    setInputToken(prev => {
      const base = isSolana ? 'SOL' : 'ETH'
      const newValue = prev === base ? 'Token' : base
      // Reset the flag after a short delay to allow state to update
      setTimeout(() => {
        isSwitchingRef.current = false
      }, 150)
      return newValue
    })
    setTokenAmount('')
  }

  const onSwapSolana = async () => {
    if (creating || solanaSendingRef.current) return
    if (!solanaConnected || !solanaPublicKey || !signTransaction) {
      toast.error('Please connect your Solana wallet')
      return
    }
    solanaSendingRef.current = true
    setCreating(true)
    try {

      const baseMint = new PublicKey(tokenAddress)
      const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112')

      const provider = new AnchorProvider(
        connection,
        {
          publicKey: solanaPublicKey,
          signTransaction: signTransaction,
          signAllTransactions: async (txs) => {
            return Promise.all(txs.map(tx => signTransaction(tx)))
          }
        },
        { commitment: 'confirmed' }
      )

      const idlJsonModule = await import('../../lib/solana/fomo.json')
      const originalIDL = idlJsonModule.default || idlJsonModule
      const mutableIDL = JSON.parse(JSON.stringify(originalIDL))

      // Ensure IDL has all required fields for Anchor
      if (!mutableIDL.instructions || !Array.isArray(mutableIDL.instructions)) {
        throw new Error('IDL missing instructions array')
      }

      // Remove accounts property entirely to avoid Anchor's size calculation
      // Anchor 0.30.0 tries to calculate sizes even with discriminators only
      // Backend uses empty accounts array, but browser version has issues
      // delete mutableIDL.accounts

      const program = new Program(mutableIDL, provider)

      // Derive PDAs
      const BONDING_CURVE_SEED = 'bonding_curve'
      const BONDING_CURVE_AUTHORITY_SEED = 'bonding_curve_authority'
      const GLOBAL_CONFIG_SEED = 'global_config'
      const CREATOR_VAULT_SEED = 'creator_vault'
      const FEE_AUTHORITY_SEED = 'fee_authority'

      const [bondingCurvePda] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), baseMint.toBuffer()],
        program.programId,
      )
  
      const [bondingCurveAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_AUTHORITY_SEED), baseMint.toBuffer()],
        program.programId,
      )
  
      const bondingCurveBaseVault = getAssociatedTokenAddressSync(
        baseMint,
        bondingCurveAuthorityPda,
        true,
      );
  
      const bondingCurveQuoteVault = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        bondingCurveAuthorityPda,
        true,
      );

      // IMPORTANT: creator_vault PDA is derived from bonding_curve.owner (creator of token),
      // not the current wallet. Fetch bonding curve to get the owner.
      const bondingCurveAccount = await program.account.bondingCurve.fetch(bondingCurvePda)
      const bondingCurveOwner = bondingCurveAccount.owner

      const [creatorVault] = PublicKey.findProgramAddressSync(
        [Buffer.from(CREATOR_VAULT_SEED), bondingCurveOwner.toBuffer()],
        program.programId,
      )
 
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_CONFIG_SEED)],
        program.programId,
      )
 
      const [feeAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(FEE_AUTHORITY_SEED)],
        program.programId,
      )

      // Get associated token accounts

      const amountLamports = Math.floor(Number(tokenAmount) * 1e9) // Convert SOL to lamports

      // Add compute budget instructions
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000
      })
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1
      })

      // u64::MAX as BN (for "cap" params where we want "accept calculated amount")
      const U64_MAX = new BN('18446744073709551615')

      let signature
      if (inputToken === baseCurrency) {
        // Buy tokens
        signature = await program.methods
          .buy({
            // buy.rs requires base_amount > 0 and uses min(calculated, args.base_amount).
            // We want to accept the calculated base amount, so set this to u64::MAX.
            baseAmount: U64_MAX,
            quoteAmount: new BN(amountLamports)
          })
          .accounts({
            buyer: solanaPublicKey,
            globalConfig: configPda,
            baseMint: baseMint,
            quoteMint: NATIVE_MINT,
            bondingCurve: bondingCurvePda,
            bondingCurveAuthority: bondingCurveAuthorityPda,
            baseVault: bondingCurveBaseVault,
            quoteVault: bondingCurveQuoteVault,
            buyerTokenAccount: getAssociatedTokenAddressSync(baseMint, solanaPublicKey),
            creatorVault: creatorVault,
            creatorQuoteAccount: getAssociatedTokenAddressSync(NATIVE_MINT, creatorVault, true),
            feeAuthority: feeAuthorityPda,
            feeQuoteAccount: getAssociatedTokenAddressSync(NATIVE_MINT, feeAuthorityPda, true),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .preInstructions([addPriorityFee, modifyComputeUnits])
          .rpc()
      } else {
        // Sell tokens
        const baseAmount = Math.floor(Number(tokenAmount) * 1e6) // Token has 6 decimals
        signature = await program.methods
          .sell({
            // sell.rs requires quote_amount > 0 and uses min(net_quote, args.quote_amount).
            // We want to accept the calculated quote amount, so set this to u64::MAX.
            baseAmount: new BN(baseAmount),
            quoteAmount: U64_MAX
          })
          .accounts({
            seller: solanaPublicKey,
            globalConfig: configPda,
            baseMint: baseMint,
            quoteMint: NATIVE_MINT,
            bondingCurve: bondingCurvePda,
            bondingCurveAuthority: bondingCurveAuthorityPda,
            baseVault: bondingCurveBaseVault,
            quoteVault: bondingCurveQuoteVault,
            // Wallet is on-curve; ATA ownerOffCurve must be false.
            sellerBaseAccount: getAssociatedTokenAddressSync(baseMint, solanaPublicKey, false),
            sellerQuoteAccount: getAssociatedTokenAddressSync(NATIVE_MINT, solanaPublicKey, false),
            creatorVault: creatorVault,
            creatorQuoteAccount: getAssociatedTokenAddressSync(NATIVE_MINT, creatorVault, true),
            feeAuthority: feeAuthorityPda,
            feeQuoteAccount: getAssociatedTokenAddressSync(NATIVE_MINT, feeAuthorityPda, true),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId
          })
          .preInstructions([addPriorityFee, modifyComputeUnits])
          .rpc()
      }

      // Wait for confirmation by polling signature status (no blockhash needed)
      await waitForSignatureConfirmation(connection, signature, 'confirmed')
      toast.success('Transaction successful!')
      setCreating(false)
      setTokenAmount('')
      // Refresh Solana token balance so the swap card shows updated balance (SOL is refreshed by parent's refetchSolanaBalance)
      try {
        const ata = getAssociatedTokenAddressSync(baseMint, solanaPublicKey, false)
        const bal = await connection.getTokenAccountBalance(ata)
        setTokenBalance(Number(bal.value.uiAmount || 0))
      } catch (e) {
        setTokenBalance(0)
      }
      if (onSwapSuccess) onSwapSuccess()
    } catch (err) {
      console.error(err)
      const msg = (err?.message ?? err?.transactionMessage ?? '').toString()
      // const alreadyProcessed = msg.includes('already been processed') || msg.includes('already been confirmed')
      // if (alreadyProcessed && signature) {
      //   // Confirmation API failed but tx may be on chain; verify and show success if so
      //   try {
      //     const status = await connection.getSignatureStatus(signature)
      //     if (status?.value && !status.value.err && (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized')) {
      //       toast.success('Transaction successful!')
      //       setCreating(false)
      //       setTokenAmount('')
      //       if (onSwapSuccess) onSwapSuccess()
      //       return
      //     }
      //   } catch (_) { /* fall through to error */ }
      // }
      toast.error(getToastErrorMessage(err))
      setCreating(false)
    } finally {
      solanaSendingRef.current = false
    }
  }

  const setMax = () => {
    if (inputToken === baseCurrency) {
      setTokenAmount((accountBalance - 0.002).toString())
    } else {
      setTokenAmount(tokenBalance.toString())
    }
  }

  // Calculate output amount (only for bonding curve, not for Uniswap)
  useEffect(() => {
    const FetchAmount = async () => {
      if (!tokenAmount || Number(tokenAmount) <= 0 || lpCreated) {
        setTokenOutAmount(0)
        return
      }
      
      // For Solana, we'll calculate based on bonding curve formula
      // This is a simplified version - in production you'd query the program
      if (isSolana) {
        // Placeholder calculation for Solana
        // In production, you'd fetch bonding curve data and calculate based on reserves
        setTokenOutAmount(0)
        return
      }
      
      if (!effectiveChainId || !web3Clients[Number(effectiveChainId)]) {
        return
      }
      try {
        const chainIdNum = Number(effectiveChainId)
          const id = inputToken === baseCurrency ? '1' : '0'
        const amounts = await readContract(config, {
          address: getAddress(bondingCurveAddress),
            abi: ChadAbi,
            functionName: 'ethOrTokenAmount',
            args: [web3Clients[chainIdNum].utils.toWei(String(tokenAmount), 'ether'), id],
            chainId: chainIdNum
          })
          setTokenOutAmount(Number(web3Clients[chainIdNum].utils.fromWei(String(amounts), 'ether')))
      } catch (e) {
        console.error('Error fetching amount:', e)
        setTokenOutAmount(0)
      }
    }
    if (tokenAmount && creating === false) {
      FetchAmount()
    }
  }, [tokenAmount, inputToken, creating, bondingCurveAddress, effectiveChainId, lpCreated, isSolana])

  // Update inputToken when initialMode or chain changes
  // This effect ensures the correct currency (ETH/SOL) is shown when:
  // 1. The mode changes (buy/sell)
  // 2. The chain changes (evm/solana)
  useEffect(() => {
    if (initialMode === 'sell') {
      setInputToken('Token')
    } else {
      setInputToken(isSolana ? 'SOL' : 'ETH')
    }
    setTokenAmount('') // Clear amount when mode changes
  }, [initialMode, isSolana, chain]) // Include chain directly to ensure we catch all changes

  // Get Uniswap V3 swap URL based on chain and token
  const getUniswapSwapUrl = () => {
    const chainIdNum = Number(effectiveChainId)
    let chainParam = ''
    
    // Map chain IDs to Uniswap chain names
    if (chainIdNum === 8453) {
      chainParam = 'base'
    } else if (chainIdNum === 1) {
      chainParam = 'ethereum'
    } else if (chainIdNum === 11155111) {
      chainParam = 'sepolia'
    }
    
    // Build Uniswap swap URL
    // For buying token: outputCurrency=TOKEN_ADDRESS
    // For selling token: inputCurrency=TOKEN_ADDRESS
    const baseUrl = 'https://app.uniswap.org/#/swap'
    const params = new URLSearchParams()
    
    if (chainParam) {
      params.append('chain', chainParam)
    }
    
    if (inputToken === baseCurrency) {
      // Buying token with ETH
      params.append('outputCurrency', tokenAddress)
    } else {
      // Selling token for ETH
      params.append('inputCurrency', tokenAddress)
    }
    
    return `${baseUrl}?${params.toString()}`
  }

  const onSwap = async () => {
    // If LP is created, redirect to Uniswap (EVM) or Raydium (Solana)
    if (lpCreated) {
      if (isSolana) {
        // For Solana, redirect to Raydium or Jupiter
        window.open(`https://jup.ag/swap/SOL-${tokenAddress}`, '_blank')
      } else {
      window.open(getUniswapSwapUrl(), '_blank')
      }
      return
    }

    // Handle Solana transactions
    if (isSolana) {
      return onSwapSolana()
    }

    try {
      setCreating(true)
      let swap
      // Use zero address if refAddress is null
      const referralAddress = refAddress || '0x0000000000000000000000000000000000000000'

      if (inputToken === baseCurrency) {
          swap = await writeContract(config, {
          address: getAddress(bondingCurveAddress),
            abi: ChadAbi,
            functionName: 'buyToken',
            value: web3Clients[effectiveChainId].utils.toWei(String(tokenAmount), 'ether'),
            args: [referralAddress],
            gas: 12000000n,
          })
      } else {
        // Check if allowance is sufficient for the sell amount
        const sellAmount = Number(tokenAmount)
        if (tokenAllowance < sellAmount) {
          const max = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
          const approveAddress = getAddress(bondingCurveAddress)
          const approveHash = await writeContract(config, {
            address: getAddress(tokenAddress),
            abi: TokenAbi,
            functionName: 'approve',
            args: [approveAddress, max],
          })
          
          // Wait for transaction confirmation before checking allowance
          await waitForTransactionReceipt(config, { hash: approveHash })
          toast.success('Token approved successfully!')
          
          // Refresh allowance after transaction is confirmed
          try {
            const allowance = await readContract(config, {
              address: getAddress(tokenAddress),
              abi: TokenAbi,
              functionName: 'allowance',
              args: [address, approveAddress],
              chainId: Number(effectiveChainId)
            })
            setTokenAllowance(Number(web3Clients[effectiveChainId].utils.fromWei(String(allowance), 'ether')))
          } catch (error) {
            console.error('Error refreshing allowance:', error)
          }
          
          setCreating(false)
          return
        }
          
          swap = await writeContract(config, {
          address: getAddress(bondingCurveAddress),
            abi: ChadAbi,
            functionName: 'sellToken',
            args: [web3Clients[effectiveChainId].utils.toWei(String(tokenAmount), 'ether'), referralAddress],
            gas: 12000000n,
          })
      }

      await waitForTransactionReceipt(config, { hash: swap })
      toast.success('Transaction successful!')

      // Report trade to backend so token_price_data is inserted for chart (EVM fallback)
      try {
        await apiService.processEVMTrade(swap, bondingCurveAddress)
      } catch (reportErr) {
        console.warn('Failed to report trade to backend for chart:', reportErr?.message)
      }

      // Refresh balances after successful transaction
      if (address) {
        refetchBalance()
        
        // Refresh token balance
        try {
          const tokenBal = await readContract(config, {
            address: getAddress(tokenAddress),
            abi: TokenAbi,
            functionName: 'balanceOf',
            args: [address],
            chainId: Number(effectiveChainId)
          })
          setTokenBalance(parseFloat(web3Clients[effectiveChainId].utils.fromWei(String(tokenBal), 'ether')))
        } catch (error) {
          console.error('Error refreshing token balance:', error)
        }
      }
      
      setCreating(false)
      setTokenAmount('')
      
      // Call onSwapSuccess callback if provided (to close modal and refresh price chart)
      if (onSwapSuccess) {
        onSwapSuccess()
      }
    } catch (err) {
      console.error(err)
      toast.error(getToastErrorMessage(err))
      setCreating(false)
    }
  }

  // When graduated/listed: redirect to DEX (Raydium/Jupiter for Solana, Uniswap for EVM)
  const handleRedirectToDex = () => {
    if (!lpCreated) return
    if (isSolana) {
      // window.open(`https://jup.ag/swap/SOL-${tokenAddress}`, '_blank')
      window.open(`https://raydium.io/swap?inputMint=${tokenAddress}&outputMint=So11111111111111111111111111111111111111112&amount=1000000000`, '_blank')
    } else {
      window.open(getUniswapSwapUrl(), '_blank')
    }
  }

  return (
    <div style={{
      background: '#111',
      borderRadius: '6px',
      padding: '25px',
      position: 'relative',
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      boxSizing: 'border-box'
    }}>
      {lpCreated && (
        <>
          <div
            role="presentation"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: '#00000080',
              borderRadius: '6px',
              zIndex: 1,
              pointerEvents: 'auto'
            }}
          />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            zIndex: 10,
            width: 'calc(100% - 50px)',
            maxWidth: '400px',
            pointerEvents: 'auto',
            background: 'rgba(17, 17, 17, 0.95)',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #333'
          }}>
            <p style={{ color: '#fff', marginBottom: '15px', fontSize: '14px' }}>
              {isSolana ? 'This token is BONDED and trading on Raydium' : 'This token is BONDED and trading on Uniswap V3'}
            </p>
            <button
              onClick={handleRedirectToDex}
              style={{
                padding: '10px 20px',
                background: '#9333EA',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%',
                maxWidth: '300px'
              }}
            >
              {isSolana ? 'Swap on Raydium' : 'Swap on Uniswap V3'}
            </button>
          </div>
        </>
      )}
      
      <div style={{ opacity: lpCreated ? 0.6 : 1 }}>
      {/* Buy/Sell Tabs - responsive: ensure always visible on mobile */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', width: '100%', minWidth: 0 }}>
        <button
          key={`buy-${inputToken}`}
          onClick={() => {
            if (lpCreated) {
              handleRedirectToDex()
              return
            }
            if (inputToken !== baseCurrency) switchTokens()
          }}
          style={{
            flex: '1 1 0',
            minWidth: 0,
            padding: '10px 8px',
            backgroundColor: inputToken === baseCurrency ? '#00c951' : '#111',
            border: inputToken === baseCurrency ? 'none' : '1px solid #333',
            borderRadius: '6px',
            color: inputToken === baseCurrency ? '#fff' : '#999',
            fontSize: '14px',
            fontWeight: inputToken === baseCurrency ? 'bold' : 'normal',
            cursor: 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent'
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.opacity = '0.9'
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          Buy
        </button>
        <button
          key={`sell-${inputToken}`}
          onClick={() => {
            if (lpCreated) {
              handleRedirectToDex()
              return
            }
            if (inputToken === baseCurrency) switchTokens()
          }}
          style={{
            flex: '1 1 0',
            minWidth: 0,
            padding: '10px 8px',
            backgroundColor: inputToken !== baseCurrency ? '#F44336' : '#111',
            border: inputToken !== baseCurrency ? 'none' : '1px solid #333',
            borderRadius: '6px',
            color: inputToken !== baseCurrency ? '#fff' : '#999',
            fontSize: '14px',
            fontWeight: inputToken !== baseCurrency ? 'bold' : 'normal',
            cursor: 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent'
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.opacity = '0.9'
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          Sell
        </button>
      </div>

      {/* Top Buttons Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '9px', marginBottom: '18px', width: '100%' }}>
        <button
          onClick={switchTokens}
          style={{
            padding: '6px 14px',
            background: 'transparent',
            border: '1px solid #333',
            borderRadius: '5px',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          Swap to {inputToken === baseCurrency ? tokenSymbol : nativeCurrencyLabel}
        </button>
        <Tooltip text="Slippage is the difference between expected and actual price. Higher tolerance = more likely to execute, but you may get a slightly worse price.">
          <button
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid #333',
              borderRadius: '5px',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Slippage Settings
          </button>
        </Tooltip>
      </div>

      {/* Balance and Input Section */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '9px' }}>
          <span style={{ color: '#999', fontSize: '12px' }}>balance:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {inputToken !== baseCurrency && (
              <img 
                src={tokenLogo} 
                alt={tokenSymbol} 
                style={{ width: '14px', height: '14px', borderRadius: '50%' }} 
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}
            <span style={{ color: '#999', fontSize: '12px' }}>
              {inputToken === baseCurrency ? accountBalance.toFixed(4) : tokenBalance.toFixed(4)} {inputToken === baseCurrency ? nativeCurrencyLabel : tokenSymbol}
            </span>
          </div>
        </div>
        
        <div style={{
          background: '#222',
          border: '1px solid #333',
          borderRadius: '6px',
          padding: '15px',
          marginBottom: '13.5px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <input
              type="number"
              value={tokenAmount}
              onChange={(e) => setTokenAmount(e.target.value)}
              placeholder="0.00"
              disabled={lpCreated}
              style={{
                width: '80%',
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '20px',
                fontWeight: 'bold',
                outline: 'none',
                textAlign: 'left',
                cursor: lpCreated ? 'not-allowed' : 'text',
                opacity: lpCreated ? 0.5 : 1
              }}
            />
            {inputToken === baseCurrency ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
                <img 
                  src={isSolana ? '/sol.svg' : '/eth.svg'} 
                  alt={nativeCurrencyLabel} 
                  style={{ width: '25px', height: '25px', borderRadius: '50%' }} 
                />
                <span style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
                  {nativeCurrencyLabel}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
                <img 
                  src={tokenLogo} 
                  alt={tokenSymbol} 
                  style={{ width: '25px', height: '25px', borderRadius: '50%' }} 
                />
                <span style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold' }}>
                  {tokenSymbol}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Input Buttons - wrap on narrow screens */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {inputToken === baseCurrency ? (
            <>
              <button
                onClick={() => lpCreated ? handleRedirectToDex() : setTokenAmount('')}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                Reset
              </button>
              <button
                onClick={() => {
                  if (lpCreated) {
                    handleRedirectToDex()
                    return
                  }
                  const amount = Math.min(0.1, accountBalance - 0.002)
                  setTokenAmount(amount > 0 ? amount.toString() : '0')
                }}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                0.1{nativeCurrencyLabel}
              </button>
              <button
                onClick={() => {
                  if (lpCreated) {
                    handleRedirectToDex()
                    return
                  }
                  const amount = Math.min(0.5, accountBalance - 0.002)
                  setTokenAmount(amount > 0 ? amount.toString() : '0')
                }}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                0.5{nativeCurrencyLabel}
              </button>
              <button
                onClick={() => {
                  if (lpCreated) {
                    handleRedirectToDex()
                    return
                  }
                  const amount = Math.min(1, accountBalance - 0.002)
                  setTokenAmount(amount > 0 ? amount.toString() : '0')
                }}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                1{nativeCurrencyLabel}
              </button>
              <button
                onClick={() => lpCreated ? handleRedirectToDex() : setMax()}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                Max
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => lpCreated ? handleRedirectToDex() : setTokenAmount('')}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                Reset
              </button>
              <button
                onClick={() => {
                  if (lpCreated) {
                    handleRedirectToDex()
                    return
                  }
                  const amount = tokenBalance * 0.1
                  setTokenAmount(amount > 0 ? amount.toString() : '0')
                }}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                10%
              </button>
              <button
                onClick={() => {
                  if (lpCreated) {
                    handleRedirectToDex()
                    return
                  }
                  const amount = tokenBalance * 0.2
                  setTokenAmount(amount > 0 ? amount.toString() : '0')
                }}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                20%
              </button>
              <button
                onClick={() => {
                  if (lpCreated) {
                    handleRedirectToDex()
                    return
                  }
                  const amount = tokenBalance * 0.5
                  setTokenAmount(amount > 0 ? amount.toString() : '0')
                }}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                50%
              </button>
              <button
                onClick={() => lpCreated ? handleRedirectToDex() : setMax()}
                disabled={lpCreated}
                style={{
                  padding: '5px 9px',
                  background: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '5px',
                  color: '#fff',
                  fontSize: '10px',
                  cursor: lpCreated ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: lpCreated ? 0.5 : 1
                }}
              >
                Max
              </button>
            </>
          )}
        </div>
      </div>

      {/* Fee breakdown (visible when amount entered) */}
      {!lpCreated && tokenAmount && Number(tokenAmount) > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <button
            onClick={() => setShowFeeBreakdown(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '8px 12px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              color: '#999',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
          >
            <span>Fee: ~{(Number(tokenAmount) * 0.01).toFixed(6)} {inputToken === baseCurrency ? nativeCurrencyLabel : tokenSymbol} (~1%)</span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"
              style={{ transform: showFeeBreakdown ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {showFeeBreakdown && (
            <div style={{
              padding: '10px 12px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              fontSize: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#999', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4CAF50', display: 'inline-block' }}/>
                  Creator Rewards
                </span>
                <span style={{ color: '#ccc' }}>0.3%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#999', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2196F3', display: 'inline-block' }}/>
                  Trader Rewards
                </span>
                <span style={{ color: '#ccc' }}>0.3%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#999', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#9333EA', display: 'inline-block' }}/>
                  Platform
                </span>
                <span style={{ color: '#ccc' }}>0.4%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Button */}
      {!isSolana && !isConnected ? (
        <div style={{ textAlign: 'center' }}>
          <w3m-button />
        </div>
      ) : isSolana && !solanaConnected ? (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setSolanaModalVisible(true)}
            style={{
              padding: '12px 24px',
              background: '#9333ea',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            Connect Solana Wallet
          </button>
        </div>
      ) : (isSolana ? solanaConnected : (effectiveChainId === '8453' || connectedChainId === 8453 || effectiveChainId === '11155111' || connectedChainId === 11155111)) ? (
        <>
          {!lpCreated && tokenAmount && Number(tokenAmount) > 0 && tokenOutAmount > 0 && (
            <Tooltip text="Estimated tokens you'll receive. Final amount may vary due to price movement between submission and execution.">
              <div style={{ marginBottom: '9px', textAlign: 'center', color: '#999', width: '100%' }}>
                ≈ {tokenOutAmount.toFixed(4)} {inputToken === baseCurrency ? tokenSymbol : nativeCurrencyLabel}
              </div>
            </Tooltip>
          )}
          <button
            onClick={onSwap}
            disabled={lpCreated || !tokenAmount || creating || Number(tokenAmount) <= 0}
            style={{
              width: '100%',
              padding: '13px',
              background: (lpCreated || !tokenAmount || creating || Number(tokenAmount) <= 0) ? '#333' : ((inputToken === baseCurrency) ? '#4CAF50' : '#F44336'),
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: (lpCreated || !tokenAmount || creating || Number(tokenAmount) <= 0) ? 'not-allowed' : 'pointer',
              opacity: (lpCreated || !tokenAmount || creating || Number(tokenAmount) <= 0) ? 0.5 : 1
            }}
          >
            {lpCreated
              ? (isSolana ? 'Swap on Raydium' : 'Swap on Uniswap V3')
              : !isSolana && inputToken !== baseCurrency && tokenAllowance === 0 
              ? 'Approve Token' 
              : creating 
              ? 'Processing...' 
              : (inputToken === baseCurrency)
              ? `Buy ${tokenSymbol}` 
              : `Sell ${tokenSymbol}`}
          </button>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#f00' }}>
          {isSolana ? 'Please connect your Solana wallet' : 'Please switch to Base or Sepolia network'}
        </div>
      )}
      </div>
    </div>
  )
}

SwapCard.propTypes = {
  tokenSymbol: PropTypes.string.isRequired,
  tokenLogo: PropTypes.string.isRequired,
  tokenAddress: PropTypes.string.isRequired,
  bondingCurveAddress: PropTypes.string.isRequired,
  effectiveChainId: PropTypes.string.isRequired,
  lpCreated: PropTypes.bool.isRequired,
  accountBalance: PropTypes.number.isRequired,
  tokenBalance: PropTypes.number.isRequired,
  tokenAllowance: PropTypes.number.isRequired,
  setTokenAllowance: PropTypes.func.isRequired,
  refAddress: PropTypes.string.isRequired,
  refetchBalance: PropTypes.func.isRequired,
  setTokenBalance: PropTypes.func.isRequired,
  initialMode: PropTypes.oneOf(['buy', 'sell'])
}

export default memo(SwapCard)

