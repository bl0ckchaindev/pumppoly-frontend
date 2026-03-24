'use client'
import React, { useState, useRef, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useWallet } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'
import { ethers } from 'ethers'
import { readContract } from '@wagmi/core'
import { sendTransaction, waitForTransactionReceipt } from 'wagmi/actions'
import { encodeFunctionData, getAddress } from 'viem'
import { toast } from 'react-hot-toast'
import { PublicKey, Keypair, SystemProgram, Connection, ComputeBudgetProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token'
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor'
import { web3Clients, coinNames, imageUploadUrl, TOKEN_TOTAL_SUPPLY, SOLANA_CHAIN, SOLANA_PROGRAM_ID, SOLANA_RPC_URL } from '../../lib/constants'
import { getFactoryAddress } from '../../lib/addressHelpers'
import { config } from '../../lib/config.jsx'
import DogDefiFactoryAbi from '../../lib/abis/FactoryUpgradeableABI.json'
import BondingCurveABI from '../../lib/abis/BondingCurveABI.json'
import { SolanaProgram } from '../../lib/solana/program'
import apiService from '../../lib/api'
import TopBar from '../../components/common/TopBar.jsx'
import SolanaWalletButton from '../../components/solana/WalletButton'
import { useChain } from '../../lib/context/ChainContext'
import BondingCurve101Modal from '../../components/common/BondingCurve101Modal'
import './CreateToken.css'
import { IDL } from '../../lib/solana/idl'
import { Fomo } from '../../lib/solana/fomo'

/** Poll until transaction is confirmed or timeout. Avoids confirmTransaction blockhash issues. */
async function waitForSignatureConfirmation(
  connection: Connection,
  signature: string,
  _commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
  timeoutMs = 60000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await connection.getSignatureStatus(signature)
    if (status.value) {
      if (status.value.err) {
        throw new Error(status.value.err?.toString?.() ?? 'Transaction failed on chain')
      }
      const s =
        status.value.confirmationStatus ??
        (status.value.confirmations != null && status.value.confirmations > 0 ? 'confirmed' : undefined)
      if (s === 'confirmed' || s === 'finalized') return
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('Transaction confirmation timeout')
}

// Declare w3m-button web component for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'w3m-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

const TrustBadge = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <div style={{
    padding: '14px',
    background: '#1a1a1a',
    border: '1px solid #222',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {icon}
      <span style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>{title}</span>
    </div>
    <span style={{ color: '#888', fontSize: '11px', lineHeight: '1.5' }}>{desc}</span>
  </div>
)

const CreateToken = () => {
  const router = useRouter()
  const { chainId, address, isConnected } = useAccount()
  const { publicKey: solanaPublicKey, signTransaction, sendTransaction: walletSendTransaction, connected: solanaConnected } = useWallet()
  const { activeChain, setActiveChain } = useChain()
  // Use activeChain from context as selectedChain
  const selectedChain = activeChain
  const setSelectedChain = setActiveChain
  const [tokenName, setTokenName] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenDescription, setTokenDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [accountBalance, setAccountBalance] = useState(0)
  const [solanaBalance, setSolanaBalance] = useState(0)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showBondingModal, setShowBondingModal] = useState(false)
  const logoFileInput = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const fetchBalance = async () => {
      if (selectedChain === 'evm' && address && (chainId === 8453 || chainId === 11155111)) {
        const balance = await web3Clients[chainId].eth.getBalance(address)
        setAccountBalance(parseFloat(web3Clients[chainId].utils.fromWei(balance, 'ether')))
      } else if (selectedChain === 'solana' && solanaPublicKey) {
        // Fetch Solana balance
        try {
          const { Connection } = await import('@solana/web3.js')
          const { SOLANA_RPC_URL } = await import('../../lib/constants')
          const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
          const balance = await connection.getBalance(solanaPublicKey)
          setSolanaBalance(balance / 1e9) // Convert lamports to SOL
        } catch (error) {
          console.error('Error fetching Solana balance:', error)
        }
      }
    }
    fetchBalance()
  }, [address, chainId, selectedChain, solanaPublicKey])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }


  const getTokenAddressesFromTx = async (txHash: string) => {
    try {
      if (!chainId) return { tokenAddress: null, bondingCurveAddress: null }
      const receipt = await web3Clients[chainId].eth.getTransactionReceipt(txHash)
      if (!receipt) return { tokenAddress: null, bondingCurveAddress: null }

      // Parse TokenCreated event from factory contract
      const factoryInterface = new ethers.utils.Interface(DogDefiFactoryAbi)
      const factoryAddress = getFactoryAddress(chainId)
      let tokenAddress: string | null = null
      let bondingCurveAddress: string | null = null

      receipt.logs.forEach((log) => {
        try {
          // Only parse logs from the factory contract
          if (log.address.toLowerCase() === factoryAddress.toLowerCase()) {
            const parsedLog = factoryInterface.parseLog(log)
            if (parsedLog && parsedLog.name === 'TokenCreated') {
              // Handle both array and object formats for event args
              if (Array.isArray(parsedLog.args)) {
                tokenAddress = parsedLog.args[0] // tokenAddress is first indexed param
                bondingCurveAddress = parsedLog.args[1] // bondingCurveAddress is second indexed param
              } else {
                tokenAddress = parsedLog.args.tokenAddress
                bondingCurveAddress = parsedLog.args.bondingCurveAddress
              }
              console.log('Found TokenCreated event:', { tokenAddress, bondingCurveAddress })
            }
          }
        } catch (err) {
          // Not a TokenCreated event, continue
        }
      })

      // Fallback: if TokenCreated event not found, try old method to get bonding curve
      if (!bondingCurveAddress) {
        const erc20TransferAbi = ['event Transfer(address indexed from, address indexed to, uint256 value)']
        const iface = new ethers.utils.Interface(erc20TransferAbi)
        let cnt = 0
        let dogDefiAddress = null

        receipt.logs.forEach((log) => {
          try {
            const parsedLog = iface.parseLog(log)
            if (parsedLog.name === 'Transfer') {
              if (cnt === 1) dogDefiAddress = parsedLog.args.to
              cnt++
            }
          } catch (err) {
            // Not a Transfer event, continue
          }
        })

        if (dogDefiAddress && !bondingCurveAddress) {
          bondingCurveAddress = dogDefiAddress
        }
      }

      // If we have bonding curve but not token address, read it from the bonding curve contract
      if (bondingCurveAddress && !tokenAddress && chainId) {
        try {
          console.log('Reading token address from bonding curve contract:', bondingCurveAddress)
          const tokenAddr = await readContract(config, {
            address: bondingCurveAddress,
            abi: BondingCurveABI,
            functionName: 'token',
            chainId: chainId
          })
          tokenAddress = String(tokenAddr)
          console.log('Got token address from bonding curve:', tokenAddress)
        } catch (err) {
          console.error('Error reading token address from bonding curve:', err)
        }
      }

      return {
        tokenAddress: tokenAddress ? String(tokenAddress).toLowerCase() : null,
        bondingCurveAddress: bondingCurveAddress ? String(bondingCurveAddress).toLowerCase() : null
      }
    } catch (error) {
      console.error('Error fetching transaction receipt:', error)
      return { tokenAddress: null, bondingCurveAddress: null }
    }
  }

  const onCreateSolana = async () => {
    try {
      if (!solanaConnected || !solanaPublicKey || !signTransaction) {
        toast.error('Please connect your Solana wallet')
        return
      }
      if (!logoFile) {
        toast.error('Please upload logo image')
        return
      }

      setCreating(true)

      // Create Solana program instance
      // const { Connection, PublicKey } = await import('@solana/web3.js')
      // const { Program, AnchorProvider, BN } = await import('@coral-xyz/anchor')
      // const { IDL } = await import('../../lib/solana/idl')

      const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
      const programId = new PublicKey(SOLANA_PROGRAM_ID)

      const provider = new AnchorProvider(
        connection,
        {
          publicKey: solanaPublicKey,
          signTransaction: signTransaction!,
          signAllTransactions: async (txs) => {
            if (!signTransaction) throw new Error('Wallet not connected')
            return Promise.all(txs.map(tx => signTransaction(tx)))
          }
        },
        { commitment: 'confirmed' }
      )

      // Import the original IDL JSON (same as backend uses)
      // It only has discriminators in accounts, but backend uses it successfully
      const idlJsonModule = await import('../../lib/solana/fomo.json')
      const originalIDL = idlJsonModule.default || idlJsonModule
      const mutableIDL = JSON.parse(JSON.stringify(originalIDL))

      // Ensure IDL has all required fields for Anchor
      if (!mutableIDL.instructions || !Array.isArray(mutableIDL.instructions)) {
        throw new Error('IDL missing instructions array')
      }

      // Verify create_token instruction exists and has args
      const createTokenInstruction = mutableIDL.instructions.find((ix: any) => ix.name === 'create_token')
      if (!createTokenInstruction || !createTokenInstruction.args) {
        throw new Error('IDL missing create_token instruction or args')
      }

      // Remove accounts property entirely to avoid Anchor's size calculation
      // Anchor 0.30.0 tries to calculate sizes even with discriminators only
      // Backend uses empty accounts array, but browser version has issues
      // delete mutableIDL.accounts

      const program: any = new Program(mutableIDL, provider)

      // console.log('[god-log] program', program)
      // Generate base mint keypair
      const baseMint = Keypair.generate()
      // const associatedTokenAccount = getAssociatedTokenAddressSync(baseMint.publicKey, solanaPublicKey, true)
      // console.log('[god-log] baseMint', baseMint.publicKey.toBase58().toString())
      // console.log('[god-log] solanaPublicKey', solanaPublicKey.toBase58().toString())
      // console.log('[god-log] associatedTokenAccount', associatedTokenAccount.toBase58().toString())
      // Constants
      const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112')
      const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

      // Derive PDAs
      const BONDING_CURVE_SEED = 'bonding_curve'
      const BONDING_CURVE_AUTHORITY_SEED = 'bonding_curve_authority'
      const GLOBAL_CONFIG_SEED = 'global_config'
      const CREATOR_VAULT_SEED = 'creator_vault'
      const FEE_AUTHORITY_SEED = 'fee_authority'

      const [bondingCurveAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_AUTHORITY_SEED), baseMint.publicKey.toBuffer()],
        programId
      )
      const [bondingCurve] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), baseMint.publicKey.toBuffer()],
        programId
      )
      const [globalConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_CONFIG_SEED)],
        programId
      )
      const [creatorVault] = PublicKey.findProgramAddressSync(
        [Buffer.from(CREATOR_VAULT_SEED), solanaPublicKey.toBuffer()],
        programId
      )
      const [feeAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(FEE_AUTHORITY_SEED)],
        programId
      )
      const [metadata] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          baseMint.publicKey.toBuffer()
        ],
        METADATA_PROGRAM_ID
      )

      // Get associated token accounts
      const baseVault = getAssociatedTokenAddressSync(baseMint.publicKey, bondingCurveAuthority, true)
      const quoteVault = getAssociatedTokenAddressSync(NATIVE_MINT, bondingCurveAuthority, true)
      const creatorQuoteAccount = getAssociatedTokenAddressSync(NATIVE_MINT, creatorVault, true)
      const feeQuoteAccount = getAssociatedTokenAddressSync(NATIVE_MINT, feeAuthority, true)

      // Upload logo first to get URI
      let logoUrl = ''
      try {
        const logoData = await apiService.uploadLogo(logoFile, baseMint.publicKey.toString()) as { fileInfo?: { filename: string } }
        if (logoData?.fileInfo) {
          logoUrl = `${imageUploadUrl}tokens/${logoData.fileInfo.filename}`
        }
      } catch (err) {
        console.error('Error uploading logo:', err)
      }

      // Build transaction manually to add compute budget instructions
      // Token creation requires more than the default 200k compute units
      const tx = await program.methods
        .createToken({
          name: tokenName,
          symbol: tokenSymbol,
          uri: logoUrl || '',
          openTime: new BN(Math.floor(Date.now() / 1000))
        })
        .accounts({
          creator: solanaPublicKey,
          globalConfig: globalConfig,
          baseMint: baseMint.publicKey,
          quoteMint: NATIVE_MINT,
          bondingCurveAuthority: bondingCurveAuthority,
          bondingCurve: bondingCurve,
          baseVault: baseVault,
          quoteVault: quoteVault,
          creatorVault: creatorVault,
          creatorQuoteAccount: creatorQuoteAccount,
          feeAuthority: feeAuthority,
          feeQuoteAccount: feeQuoteAccount,
          metadata: metadata,
          metadataProgram: METADATA_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID, // Standard SPL Token program (not Token-2022)
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: null
        } as any)
        .signers([baseMint])
        .transaction()

      // Add compute budget instructions to increase compute limit
      // Token creation with metadata requires ~300k+ compute units
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000 // Increase to 400k compute units
      })
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1 // Small priority fee to ensure transaction is processed
      })

      // Add compute budget instructions at the beginning (must be first)
      tx.instructions.unshift(modifyComputeUnits)
      tx.instructions.unshift(addPriorityFee)

      // Get recent blockhash and last valid block height
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash
      tx.feePayer = solanaPublicKey

      // Partially sign transaction with baseMint keypair (required before wallet signing)
      tx.partialSign(baseMint)

      // Simulate transaction to check for errors before signing
      const simulation = await connection.simulateTransaction(tx)
      // console.log('[god-log] simulation', simulation)
      
      if (simulation.value.err) {
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`)
      }

      // Sign transaction with wallet (baseMint is already signed)
      if (!signTransaction) {
        throw new Error('Wallet not connected or signTransaction not available')
      }

      const signedTx = await signTransaction(tx)

      // Send and confirm transaction using sendRawTransaction (correct for signed transactions)
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: 'confirmed'
      })

      // console.log('[god-log] signature', signature)

      // Wait for confirmation by polling signature status (avoids confirmTransaction blockhash quirks)
      await waitForSignatureConfirmation(connection, signature, 'confirmed')

      toast.success('Token created')
      router.push(`/token/${baseMint.publicKey.toString()}?chain=solana`)
      setCreating(false)
    } catch (err: any) {
      console.error(err)
      const m = (err?.message || '').toLowerCase()
      toast.error(m.includes('reject') || m.includes('denied') ? 'Transaction rejected' : m.includes('insufficient') ? (err.message || 'Insufficient balance') : 'Transaction failed')
      setCreating(false)
    }
  }

  const onCreate = async () => {
    if (selectedChain === 'solana') {
      return onCreateSolana()
    }

    try {
      if (!isConnected) {
        toast.error('Please connect your wallet')
        return
      }
      if (!logoFile || !chainId) {
        toast.error('Please upload logo image')
        return
      }

      const depositValue = depositAmount && Number(depositAmount) > 0 ? Number(depositAmount) : 0
      const totalCost = depositValue

      if (depositValue > 0 && accountBalance > 0 && totalCost > accountBalance) {
        toast.error(`Insufficient balance. You need ${totalCost.toFixed(4)} ${coinNames[chainId]} but have ${accountBalance.toFixed(4)} ${coinNames[chainId]}`)
        return
      }

      setCreating(true)

      const valueInWei = web3Clients[chainId].utils.toWei(String(totalCost), 'ether')
      const factoryAddress = getFactoryAddress(chainId)

      // Encode function data
      const data = encodeFunctionData({
        abi: DogDefiFactoryAbi,
        functionName: 'createToken',
        args: [[tokenName, tokenSymbol, tokenDescription, website, twitter, telegram, '']]
      })

      // Use sendTransaction with explicit gas limit to avoid EIP-3860 cap
      const create = await sendTransaction(config, {
        to: getAddress(factoryAddress),
        value: BigInt(valueInWei.toString()),
        data: data,
        gas: BigInt(12000000), // Set to 12M to stay well below the 16.7M EIP-3860 cap
      })

      await waitForTransactionReceipt(config, { hash: create })
      const { tokenAddress, bondingCurveAddress } = await getTokenAddressesFromTx(create)

      console.log('Extracted addresses:', { tokenAddress, bondingCurveAddress })

      if (!tokenAddress) {
        toast.error('Failed to get token address from transaction. Please try refreshing the page.')
        setCreating(false)
        return
      }

      // Get transaction receipt to extract other details
      const receipt = await web3Clients[chainId].eth.getTransactionReceipt(create)
      const block = await web3Clients[chainId].eth.getBlock(receipt.blockNumber)
      const timestamp = Number(block.timestamp)

      // Upload logo first so we can pass logoUrl when registering the token
      let logoUrl = ''
      try {
        console.log('Uploading logo file:', logoFile?.name, 'for token address:', tokenAddress)
        const logoData = await apiService.uploadLogo(logoFile, tokenAddress) as { fileInfo?: { filename: string } }
        console.log('Logo upload response:', logoData)
        if (logoData?.fileInfo) {
          logoUrl = `${imageUploadUrl}tokens/${logoData.fileInfo.filename}`
          console.log('Logo URL:', logoUrl)
        } else {
          console.warn('Logo upload succeeded but no fileInfo in response')
        }
      } catch (err) {
        console.error('Error uploading logo:', err)
        console.error('Error details:', err instanceof Error ? err.message : String(err))
      }

      // Register token with backend (including logoUrl so the token logo is stored and displayed)
      if (bondingCurveAddress && address) {
        try {
          await apiService.registerEVMToken({
            chainId,
            transactionHash: create,
            tokenAddress,
            bondingCurveAddress,
            creator: address,
            name: tokenName.trim(),
            symbol: tokenSymbol.trim(),
            description: tokenDescription?.trim() || '',
            website: website?.trim() || '',
            twitter: twitter?.trim() || '',
            telegram: telegram?.trim() || '',
            blockNumber: receipt.blockNumber,
            timestamp,
            logoUrl: logoUrl || undefined,
            bannerUrl: undefined
          })
        } catch (regErr) {
          console.warn('Token registration with backend failed (token still created on-chain):', regErr)
          // Don't block redirect; token page can load from chain. List may not show it until backend picks it up.
        }
      }

      toast.success('Token created')
      // Always redirect to new URL format using token address
      console.log('Redirecting to:', `/token/${tokenAddress}`)
      router.push(`/token/${tokenAddress}`)
      setCreating(false)
    } catch (err) {
      console.error(err)
      toast.error('Transaction failed')
      setCreating(false)
    }
  }

  const hasRequiredFields = tokenName.trim() && tokenSymbol.trim() && logoFile
  const depositValue = depositAmount && Number(depositAmount) > 0 ? Number(depositAmount) : 0
  const totalCost = depositValue
  const hasSufficientBalance = selectedChain === 'evm'
    ? (depositValue === 0 || (accountBalance > 0 && totalCost <= accountBalance && chainId))
    : (solanaConnected && (depositValue === 0 || solanaBalance > 0))
  const isWalletConnected = selectedChain === 'evm' ? isConnected : solanaConnected

  return (
    <div className="create-token-page">
      <TopBar />
      <div className="create-token-content">
        <h1 className="create-token-title">Create Token</h1>

        <div className="create-token-form">
          {/* Chain Display (controlled by global chain switcher) */}
          <div className="create-token-field">
            <label className="create-token-label">Network</label>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              marginTop: '8px',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid #333',
              background: '#1a1a1a'
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: selectedChain === 'evm' ? '#60a5fa' : '#4ade80'
              }} />
              <span style={{ color: '#fff', fontWeight: '500' }}>
                {selectedChain === 'evm' ? 'EVM (Base/Sepolia)' : 'Solana (Devnet)'}
              </span>
              <span style={{ color: '#666', fontSize: '12px', marginLeft: 'auto' }}>
                Switch via wallet button
              </span>
            </div>
          </div>
          {/* Name Field */}
          <div className="create-token-field">
            <label className="create-token-label-required">Name</label>
            <input
              type="text"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="e.g., My Doge Token"
              className="create-token-input"
            />
          </div>

          {/* Ticker Field */}
          <div className="create-token-field">
            <label className="create-token-label-required">Ticker</label>
            <input
              type="text"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value)}
              placeholder="e.g., MDOGE"
              className="create-token-input"
            />
          </div>

          {/* Description Field */}
          <div className="create-token-field">
            <label className="create-token-label">Description (Optional)</label>
            <textarea
              value={tokenDescription}
              onChange={(e) => setTokenDescription(e.target.value)}
              placeholder="Describe your token..."
              className="create-token-textarea"
              rows={4}
            />
          </div>

          {/* Token Logo Upload */}
          <div className="create-token-field">
            <label className="create-token-label-required">Token Logo</label>
            <input
              type="file"
              ref={logoFileInput}
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleLogoChange}
              className="create-token-file-input"
            />
            <div
              onClick={() => logoFileInput.current?.click()}
              className="create-token-upload-area"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" className="create-token-upload-preview" />
              ) : (
                <>
                  <svg className="create-token-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                  <span className="create-token-upload-text">Upload logo (PNG, JPG)</span>
                </>
              )}
            </div>
          </div>

          {/* Initial Buy Field */}
          <div className="create-token-field">
            <label className="create-token-label">Initial Buy ({selectedChain === 'solana' ? 'SOL' : (chainId && coinNames[chainId] ? coinNames[chainId] : 'ETH')}) (Optional)</label>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.1"
              step="0.01"
              min="0"
              className="create-token-input"
            />
            {/* <span className="create-token-info-text">Minimum initial buy to bootstrap liquidity</span> */}
          </div>

          {/* Creator Allocation Display */}
          <div className="create-token-allocation-section">
            <div className="create-token-allocation-label">
              <span className="create-token-allocation-label-text" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Creator Allocation
                <button
                  onClick={() => setShowBondingModal(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center', color: '#9333EA' }}
                  title="Learn how the bonding curve works"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                </button>
              </span>
              <span className="create-token-allocation-label-desc">Maximum allocation capped for fair launch</span>
            </div>
            <span className="create-token-allocation-value">15%</span>
          </div>

          {/* How pricing works */}
          <div
            onClick={() => setShowBondingModal(true)}
            style={{
              padding: '12px 16px',
              background: 'rgba(147, 51, 234, 0.06)',
              border: '1px solid rgba(147, 51, 234, 0.2)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9333EA" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <div>
              <div style={{ color: '#9333EA', fontSize: '13px', fontWeight: '600' }}>How does pricing work?</div>
              <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>Click to learn about the bonding curve, fees, and rewards.</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" style={{ flexShrink: 0, marginLeft: 'auto' }}>
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>

          {/* Social Links Section */}
          <div className="create-token-social-section">
            <label className="create-token-label">Social Links (Optional)</label>

            {/* Website Field */}
            <div className="create-token-social-input-wrapper">
              <svg className="create-token-social-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#9333EA' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="create-token-social-input"
              />
            </div>

            {/* Twitter Field */}
            <div className="create-token-social-input-wrapper">
              <svg className="create-token-social-icon" viewBox="0 0 24 24" fill="#1DA1F2">
                <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
              </svg>
              <input
                type="text"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="https://twitter.com/yourtoken"
                className="create-token-social-input"
              />
            </div>

            {/* Telegram Field */}
            <div className="create-token-social-input-wrapper">
              <svg className="create-token-social-icon" viewBox="0 0 24 24" fill="#0088cc">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16l-1.84 8.66c-.138.625-.497.78-1.006.485l-2.78-2.05-1.34 1.29c-.155.155-.285.285-.585.285l.2-2.83 5.14-4.64c.224-.2-.05-.31-.346-.11l-6.35 4.01-2.74-.86c-.595-.19-.61-.595.12-.89l10.7-4.13c.495-.18.93.11.76.65z" />
              </svg>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="https://t.me/yourtoken"
                className="create-token-social-input"
              />
            </div>
          </div>

          {/* Submit Button */}
          {!isWalletConnected ? (
            <div className="create-token-connect-wallet">
              {selectedChain === 'evm' ? (
                <>
                  <w3m-button />
                  <span className="create-token-connect-text">Connect your EVM wallet to create a token</span>
                </>
              ) : (
                <>
                  <SolanaWalletButton />
                  <span className="create-token-connect-text">Connect your Solana wallet to create a token</span>
                </>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={onCreate}
                disabled={!hasRequiredFields || creating || !hasSufficientBalance}
                className="create-token-submit-button"
              >
                {creating ? 'Creating...' : 'Create Token'}
              </button>
              {selectedChain === 'evm' && depositValue > 0 && accountBalance > 0 && !hasSufficientBalance && chainId && (
                <div className="create-token-error">
                  Insufficient balance. You need {totalCost.toFixed(4)} {coinNames[chainId]} but have {accountBalance.toFixed(4)} {coinNames[chainId]}
                </div>
              )}
              {selectedChain === 'solana' && solanaBalance <= 0 && solanaConnected && (
                <div className="create-token-error">
                  Insufficient SOL balance. You need some SOL for network fees.
                </div>
              )}
              {/* Free creation disclosure */}
              <div style={{
                marginTop: '12px',
                padding: '12px 16px',
                background: 'rgba(76, 175, 80, 0.08)',
                border: '1px solid rgba(76, 175, 80, 0.25)',
                borderRadius: '10px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <div style={{ color: '#4CAF50', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                    Token creation is free!
                  </div>
                  <div style={{ color: '#999', fontSize: '12px', lineHeight: '1.5' }}>
                    No upfront cost to launch. A small platform fee (~1%) is automatically deducted from trades on your token.
                    {depositAmount && Number(depositAmount) > 0 && (
                      <span style={{ display: 'block', marginTop: '4px', color: '#ccc' }}>
                        Initial buy: {depositAmount} {selectedChain === 'solana' ? 'SOL' : (chainId && coinNames[chainId] ? coinNames[chainId] : 'ETH')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Why PumpPoly? Trust badges */}
        <div style={{
          marginTop: '24px',
          padding: '20px',
          background: '#111',
          border: '1px solid #333',
          borderRadius: '12px',
        }}>
          <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: '700', marginBottom: '16px', textAlign: 'center' }}>
            Why PumpPoly?
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}>
            <TrustBadge
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9333EA" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
              title="Fair Launch"
              desc="No presale, no insider allocation. Everyone buys on the same curve."
            />
            <TrustBadge
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2196F3" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              title="Transparent Fees"
              desc="All fees are on-chain and visible. See exactly where every fraction goes."
            />
            <TrustBadge
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
              title="Secured"
              desc="Smart contracts audited. Liquidity auto-locked on bonding completion."
            />
            <TrustBadge
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
              title="Simple"
              desc="Create a token in 30 seconds. No coding required."
            />
          </div>
        </div>
      </div>
      <BondingCurve101Modal isOpen={showBondingModal} onClose={() => setShowBondingModal(false)} />
    </div>
  )
}

export default function CreatePage() {
  return <CreateToken />
}
