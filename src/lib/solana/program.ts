import { Connection, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'
import { WalletContextState } from '@solana/wallet-adapter-react'
import { SOLANA_RPC_URL, SOLANA_PROGRAM_ID } from '../constants'
import { IDL } from './idl'
import { Fomo } from './fomo'

const PROGRAM_ID = new PublicKey(SOLANA_PROGRAM_ID)
const GLOBAL_CONFIG_SEED = 'global_config'
const BONDING_CURVE_SEED = 'bonding_curve'
const BONDING_CURVE_AUTHORITY_SEED = 'bonding_curve_authority'
const CREATOR_VAULT_SEED = 'creator_vault'
const FEE_AUTHORITY_SEED = 'fee_authority'
const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112')
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

export class SolanaProgram {
    connection: Connection
    program: Program<Fomo>
    provider: AnchorProvider

    constructor(wallet: WalletContextState) {
        this.connection = new Connection(SOLANA_RPC_URL, 'confirmed')
        this.provider = new AnchorProvider(
            this.connection,
            {
                publicKey: wallet.publicKey || null,
                signTransaction: wallet.signTransaction?.bind(wallet) || (async () => { throw new Error('Wallet not connected') }),
                signAllTransactions: wallet.signAllTransactions?.bind(wallet) || (async () => { throw new Error('Wallet not connected') })
            } as any,
            { commitment: 'confirmed' }
        )
        this.program = new Program(IDL as any, this.provider)
    }

    getBondingCurvePDA(baseMint: PublicKey): PublicKey {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from(BONDING_CURVE_SEED), baseMint.toBuffer()],
            PROGRAM_ID
        )
        return pda
    }

    getBondingCurveAuthorityPDA(baseMint: PublicKey): PublicKey {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from(BONDING_CURVE_AUTHORITY_SEED), baseMint.toBuffer()],
            PROGRAM_ID
        )
        return pda
    }

    getGlobalConfigPDA(): PublicKey {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from(GLOBAL_CONFIG_SEED)],
            PROGRAM_ID
        )
        return pda
    }

    getFeeAuthorityPDA(): PublicKey {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from(FEE_AUTHORITY_SEED)],
            PROGRAM_ID
        )
        return pda
    }

    getMetadataPDA(mint: PublicKey): PublicKey {
        const [pda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                METADATA_PROGRAM_ID.toBuffer(),
                mint.toBuffer()
            ],
            METADATA_PROGRAM_ID
        )
        return pda
    }

    async getBondingCurve(baseMint: string) {
        const mint = new PublicKey(baseMint)
        const bondingCurve = this.getBondingCurvePDA(mint)
        
        try {
            const account = await (this.program.account as any).bondingCurve.fetch(bondingCurve)
            return {
                owner: account.owner.toString(),
                openTime: account.openTime.toNumber(),
                realBaseReserves: account.realBaseReserves.toNumber(),
                virtualBaseReserves: account.virtualBaseReserves.toNumber(),
                realQuoteReserves: account.realQuoteReserves.toNumber(),
                virtualQuoteReserves: account.virtualQuoteReserves.toNumber(),
                totalSupply: account.totalSupply.toNumber(),
                complete: account.complete
            }
        } catch (error) {
            return null
        }
    }

    /** Fetch GlobalConfig and return real_sol_threshold in lamports (divide by 1e9 for SOL) */
    async getGlobalConfig(): Promise<{ realSolThreshold: number } | null> {
        try {
            const pda = this.getGlobalConfigPDA()
            // console.log('[god-log] pda', pda.toBase58());
            const account = await this.program.account.globalConfig.fetch(pda, 'confirmed')
            // console.log('[god-log] account', account);
            const raw = account?.realSolThreshold ?? (account as { real_sol_threshold?: BN }).real_sol_threshold
            // console.log('[god-log] raw', raw)
            const lamports = typeof raw?.toNumber === 'function' ? raw.toNumber() : Number(raw ?? 0)
            // console.log('[god-log] lamports', lamports)
            return { realSolThreshold: lamports }
        } catch (error) {
            return null
        }
    }
}

