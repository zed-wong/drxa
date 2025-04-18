// src/adapters/solana/SolanaAdapter.ts
import { IChainAdapter } from "../../interfaces/IChainAdapter";
import { deriveForChain, DeriveParams } from "../../utils/derivation";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { ChainManager } from "../../core/ChainManager";
import { getRpcEndpoints } from "../../constants/config";

/**
 * Solana adapter: derive, send, and monitor SOL transfers.
 */
export class SolanaAdapter implements IChainAdapter {
  readonly chainName = "solana";
  private connection: Connection;
  private masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array) {
    const { http, ws } = getRpcEndpoints("solana");
    // we only need HTTP for send/derive; ws is unused here
    this.connection = new Connection(http, "confirmed");
    this.masterSeed = masterSeed;
    ChainManager.register(this);
  }

  /** 
   * Derive a Solana address (Base58 pubkey) via unified derivation.
   */
  async deriveAddress(params: DeriveParams): Promise<string> {
    const { address } = deriveForChain(this.masterSeed, params);
    // deriveForChain maps "solana" to a bs58-encoded ed25519 pubkey
    return address;
  }

  /**
   * Send lamports from a derived address to `to`.
   * `amount` is in lamports (1 SOL = 10^9 lamports).
   */
  async send(
    path: string,
    to: string,
    amount: number | bigint
  ): Promise<{ txHash: string }> {
    const params: DeriveParams = {
      scope:  "wallet",
      userId: "default",
      chain:  "solana",
      index:  path,
    };
    // derive the private key seed
    const { priv } = deriveForChain(this.masterSeed, params);
    const keypair = Keypair.fromSeed(priv);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey:  new PublicKey(to),
        lamports:  typeof amount === "bigint" ? Number(amount) : amount,
      })
    );

    const sig = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [keypair],
      { commitment: "confirmed" }
    );
    return { txHash: sig };
  }

  /**
   * Poll getSignaturesForAddress every 10s and emit unseen transactions.
   */
  async subscribe(
    address: string,
    onIncoming: (txHash: string, amount: number | bigint) => void
  ): Promise<{ unsubscribe: () => void }> {
    const seen = new Set<string>();
    const pubkey = new PublicKey(address);

    const iv = setInterval(async () => {
      try {
        const sigInfos = await this.connection.getSignaturesForAddress(pubkey, { limit: 10 });
        for (const info of sigInfos) {
          if (!seen.has(info.signature)) {
            seen.add(info.signature);
            // lamports amount not easily extractable here; emit 0
            onIncoming(info.signature, 0n);
          }
        }
      } catch (err) {
        console.error("Solana subscribe error", err);
      }
    }, 10_000);

    return { unsubscribe: () => clearInterval(iv) };
  }
}

/**
 * Register the SolanaAdapter in the ChainManager.
 */
export function registerSolanaAdapter(masterSeed: Uint8Array) {
  new SolanaAdapter(masterSeed);
}
