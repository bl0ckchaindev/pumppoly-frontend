'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { readContract } from 'viem/actions'
import { getAddress } from 'viem'
import { useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token'
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { toast } from 'react-hot-toast'
import BondingCurveABI from '../../lib/abis/BondingCurveABI.json'
import FactoryUpgradeableABI from '../../lib/abis/FactoryUpgradeableABI.json'
import { config } from '../../lib/config.jsx'
import { SOLANA_PROGRAM_ID, SOLANA_RPC_URL } from '../../lib/constants'
import { isSolanaChain, isEvmCompatibleChain } from '../../lib/chainUtils'

const BONDING_CURVE_SEED = 'bonding_curve'
const BONDING_CURVE_AUTHORITY_SEED = 'bonding_curve_authority'
const GLOBAL_CONFIG_SEED = 'global_config'

const DEFAULT_PUBKEY_STR = '11111111111111111111111111111111'

const readOnlyAnchorWallet = {
  publicKey: PublicKey.default,
  signTransaction: async (tx: Transaction) => tx,
  signAllTransactions: async (txs: Transaction[]) => txs
}

type Props = {
  chain: string | undefined
  bondingCurveAddress: string | null | undefined
  tokenMintAddress: string | null | undefined
  effectiveChainId: number | undefined
  lpCreated: boolean
  /** From Supabase when on-chain read unavailable */
  backendLockSeconds?: string | null
  backendUnlockTs?: number | null
  backendLpUnlocked?: boolean
}

export default function LiquidityLockCard({
  chain,
  bondingCurveAddress,
  tokenMintAddress,
  effectiveChainId,
  lpCreated,
  backendLockSeconds,
  backendUnlockTs,
  backendLpUnlocked
}: Props) {
  const { address: evmAddress } = useAccount()
  const { publicKey, signTransaction, sendTransaction: walletSendTransaction } = useWallet()

  const [lockDurationSec, setLockDurationSec] = useState<bigint | null>(null)
  const [unlockTimeSec, setUnlockTimeSec] = useState<bigint | null>(null)
  const [withdrawn, setWithdrawn] = useState(false)
  const [devWallet, setDevWallet] = useState<string | null>(null)
  const [solMigrator, setSolMigrator] = useState<string | null>(null)
  const [solCreator, setSolCreator] = useState<string | null>(null)
  const [solUnlockTs, setSolUnlockTs] = useState<number | null>(null)
  const [solLockSecs, setSolLockSecs] = useState<number | null>(null)
  const [solLpUnlocked, setSolLpUnlocked] = useState(false)
  const [solPoolLpMint, setSolPoolLpMint] = useState<string | null>(null)
  const [solComplete, setSolComplete] = useState(false)
  const [loading, setLoading] = useState(true)

  const { writeContract, data: hash, isPending: isWithdrawPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (writeError) {
      toast.error(writeError.message?.slice(0, 120) || 'Transaction failed')
    }
  }, [writeError])

  useEffect(() => {
    if (isConfirmed) {
      toast.success('LP withdrawn')
      setWithdrawn(true)
    }
  }, [isConfirmed])

  const nowSec = Math.floor(Date.now() / 1000)

  const fetchEvm = useCallback(async () => {
    if (!bondingCurveAddress || !effectiveChainId || !isEvmCompatibleChain(chain)) return
    setLoading(true)
    try {
      const bc = getAddress(bondingCurveAddress)
      const [dur, unlock, wd, factoryAddr] = await Promise.all([
        readContract(config, {
          address: bc,
          abi: BondingCurveABI,
          functionName: 'liquidityLockDuration',
          chainId: effectiveChainId
        }) as Promise<bigint>,
        readContract(config, {
          address: bc,
          abi: BondingCurveABI,
          functionName: 'liquidityUnlockTime',
          chainId: effectiveChainId
        }) as Promise<bigint>,
        readContract(config, {
          address: bc,
          abi: BondingCurveABI,
          functionName: 'liquidityWithdrawn',
          chainId: effectiveChainId
        }) as Promise<boolean>,
        readContract(config, {
          address: bc,
          abi: BondingCurveABI,
          functionName: 'factoryContract',
          chainId: effectiveChainId
        }) as Promise<`0x${string}`>
      ])
      const dw = await readContract(config, {
        address: factoryAddr,
        abi: FactoryUpgradeableABI,
        functionName: 'devWallet',
        chainId: effectiveChainId
      }) as Promise<`0x${string}`>
      setLockDurationSec(dur)
      setUnlockTimeSec(unlock)
      setWithdrawn(Boolean(wd))
      setDevWallet(getAddress(dw))
    } catch (e) {
      console.warn('LiquidityLockCard EVM read failed', e)
      if (backendLockSeconds) setLockDurationSec(BigInt(backendLockSeconds))
      if (backendUnlockTs != null) setUnlockTimeSec(BigInt(backendUnlockTs))
      if (backendLpUnlocked) setWithdrawn(true)
    } finally {
      setLoading(false)
    }
  }, [bondingCurveAddress, effectiveChainId, chain, backendLockSeconds, backendUnlockTs, backendLpUnlocked])

  const fetchSol = useCallback(async () => {
    if (!bondingCurveAddress || !tokenMintAddress || !isSolanaChain(chain)) return
    setLoading(true)
    try {
      const programId = new PublicKey(SOLANA_PROGRAM_ID)
      const mintPk = new PublicKey(tokenMintAddress)
      const [bondingCurvePda] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mintPk.toBuffer()],
        programId
      )
      const conn = new Connection(SOLANA_RPC_URL, 'confirmed')
      const idl = (await import('../../lib/solana/fomo.json')).default
      const provider = new AnchorProvider(conn, readOnlyAnchorWallet as any, { commitment: 'confirmed' })
      const program = new Program(idl as any, programId, provider)
      const bc: any = await program.account.bondingCurve.fetch(bondingCurvePda)
      setSolCreator(bc.owner?.toBase58?.() || null)
      setSolComplete(Boolean(bc.complete))
      setSolLockSecs(Number(bc.liquidityLockSecs))
      setSolUnlockTs(Number(bc.liquidityUnlockTs))
      setSolLpUnlocked(Boolean(bc.lpUnlocked))
      const lpPk = bc.poolLpMint as PublicKey
      setSolPoolLpMint(lpPk?.toBase58?.() || DEFAULT_PUBKEY_STR)

      const [gc] = PublicKey.findProgramAddressSync([Buffer.from(GLOBAL_CONFIG_SEED)], programId)
      const gcAcc: any = await program.account.globalConfig.fetch(gc)
      setSolMigrator(gcAcc.migrator?.toBase58?.() || null)
    } catch (e) {
      console.warn('LiquidityLockCard Solana read failed', e)
      if (backendLockSeconds) setSolLockSecs(Number(backendLockSeconds))
      if (backendUnlockTs != null) setSolUnlockTs(backendUnlockTs)
      if (backendLpUnlocked) setSolLpUnlocked(true)
      if (lpCreated) setSolComplete(true)
    } finally {
      setLoading(false)
    }
  }, [bondingCurveAddress, tokenMintAddress, chain, backendLockSeconds, backendUnlockTs, backendLpUnlocked, lpCreated])

  useEffect(() => {
    if (!lpCreated) {
      setLoading(false)
      return
    }
    if (isEvmCompatibleChain(chain)) void fetchEvm()
    else if (isSolanaChain(chain)) void fetchSol()
    else setLoading(false)
  }, [lpCreated, chain, fetchEvm, fetchSol])

  const progressPct = useMemo(() => {
    if (isEvmCompatibleChain(chain) && unlockTimeSec != null && lockDurationSec != null && lockDurationSec > 0n) {
      const end = Number(unlockTimeSec)
      const start = end - Number(lockDurationSec)
      if (nowSec <= start) return 0
      if (nowSec >= end) return 100
      return Math.min(100, Math.round(((nowSec - start) / (end - start)) * 100))
    }
    if (isSolanaChain(chain) && solUnlockTs != null && solLockSecs != null && solLockSecs > 0) {
      const end = solUnlockTs
      const start = end - solLockSecs
      if (nowSec <= start) return 0
      if (nowSec >= end) return 100
      return Math.min(100, Math.round(((nowSec - start) / (end - start)) * 100))
    }
    return 0
  }, [chain, unlockTimeSec, lockDurationSec, solUnlockTs, solLockSecs, nowSec])

  const canUnlockEvm =
    isEvmCompatibleChain(chain) &&
    lpCreated &&
    evmAddress &&
    devWallet &&
    evmAddress.toLowerCase() === devWallet.toLowerCase() &&
    unlockTimeSec != null &&
    BigInt(nowSec) >= unlockTimeSec &&
    !withdrawn

  const solCanClaimLp =
    !!publicKey &&
    !!(
      (solMigrator && publicKey.toBase58() === solMigrator) ||
      (solCreator && publicKey.toBase58() === solCreator)
    )

  const canUnlockSol =
    isSolanaChain(chain) &&
    lpCreated &&
    solCanClaimLp &&
    solUnlockTs != null &&
    nowSec >= solUnlockTs &&
    !solLpUnlocked &&
    solPoolLpMint &&
    solPoolLpMint !== DEFAULT_PUBKEY_STR

  const onUnlockSol = async () => {
    if (!canUnlockSol || !tokenMintAddress || !signTransaction || !walletSendTransaction) return
    try {
      const programId = new PublicKey(SOLANA_PROGRAM_ID)
      const mintPk = new PublicKey(tokenMintAddress)
      const lpMintPk = new PublicKey(solPoolLpMint!)
      const [bondingCurvePda] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mintPk.toBuffer()],
        programId
      )
      const [bondingCurveAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_AUTHORITY_SEED), mintPk.toBuffer()],
        programId
      )
      const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from(GLOBAL_CONFIG_SEED)], programId)
      const bondingCurveLp = getAssociatedTokenAddressSync(lpMintPk, bondingCurveAuthority, true)
      const migratorLp = getAssociatedTokenAddressSync(lpMintPk, publicKey, false)

      const conn = new Connection(SOLANA_RPC_URL, 'confirmed')
      const idl = (await import('../../lib/solana/fomo.json')).default
      const walletWrapper = {
        publicKey,
        signTransaction: signTransaction!,
        signAllTransactions: async (txs: Transaction[]) => Promise.all(txs.map((t) => signTransaction!(t)))
      }
      const provider = new AnchorProvider(conn, walletWrapper as any, { commitment: 'confirmed' })
      const program = new Program(idl as any, programId, provider)

      const tx = await program.methods
        .unlockLp()
        .accounts({
          migrator: publicKey,
          globalConfig,
          bondingCurve: bondingCurvePda,
          bondingCurveAuthority,
          baseMint: mintPk,
          lpMint: lpMintPk,
          bondingCurveLpToken: bondingCurveLp,
          migratorLpToken: migratorLp,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId
        } as any)
        .transaction()

      const sig = await walletSendTransaction(tx, conn)
      await conn.confirmTransaction(sig, 'confirmed')
      toast.success('LP unlocked to your wallet')
      setSolLpUnlocked(true)
    } catch (e: any) {
      toast.error(e?.message?.slice(0, 140) || 'Unlock failed')
    }
  }

  if (!lpCreated || !bondingCurveAddress) return null

  return (
    <div
      style={{
        marginTop: '12px',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid rgba(147, 51, 234, 0.35)',
        background: '#141414'
      }}
    >
      <div style={{ color: '#9333EA', fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>LP lock</div>
      {loading ? (
        <div style={{ color: '#888', fontSize: '13px' }}>Loading lock status…</div>
      ) : (
        <>
          <div style={{ height: 8, borderRadius: 4, background: '#2a2a2a', overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg,#9333EA,#a78bfa)', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ color: '#aaa', fontSize: '12px', lineHeight: 1.5 }}>
            {isEvmCompatibleChain(chain) && lockDurationSec != null && (
              <div>Lock duration: {(Number(lockDurationSec) / 86400).toFixed(1)} days</div>
            )}
            {isSolanaChain(chain) && solLockSecs != null && <div>Lock duration: {(solLockSecs / 86400).toFixed(1)} days</div>}
            {isEvmCompatibleChain(chain) && unlockTimeSec != null && Number(unlockTimeSec) > 0 && (
              <div>Unlocks (UTC): {new Date(Number(unlockTimeSec) * 1000).toISOString().replace('T', ' ').slice(0, 19)}</div>
            )}
            {isSolanaChain(chain) && solUnlockTs != null && solUnlockTs > 0 && (
              <div>Unlocks (UTC): {new Date(solUnlockTs * 1000).toISOString().replace('T', ' ').slice(0, 19)}</div>
            )}
            {isEvmCompatibleChain(chain) && withdrawn && <div style={{ color: '#4ade80' }}>Liquidity already withdrawn from bonding curve.</div>}
            {isSolanaChain(chain) && solLpUnlocked && <div style={{ color: '#4ade80' }}>LP tokens already unlocked to a wallet.</div>}
          </div>
          {canUnlockEvm && bondingCurveAddress && effectiveChainId && (
            <button
              type="button"
              onClick={() =>
                writeContract({
                  address: getAddress(bondingCurveAddress),
                  abi: BondingCurveABI,
                  functionName: 'withdrawLiquidity',
                  chainId: effectiveChainId
                })
              }
              disabled={isWithdrawPending || isConfirming}
              style={{
                marginTop: 12,
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#9333EA',
                color: '#fff',
                fontWeight: 600,
                cursor: isWithdrawPending || isConfirming ? 'wait' : 'pointer',
                opacity: isWithdrawPending || isConfirming ? 0.7 : 1
              }}
            >
              {isWithdrawPending || isConfirming ? 'Confirm in wallet…' : 'Withdraw LP (dev)'}
            </button>
          )}
          {canUnlockSol && (
            <button
              type="button"
              onClick={() => void onUnlockSol()}
              style={{
                marginTop: 12,
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#9333EA',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Unlock LP to wallet (creator or migrator)
            </button>
          )}
        </>
      )}
    </div>
  )
}
