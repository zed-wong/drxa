// src/adapters/solana/SolanaAdapter.ts
import { IChainAdapter } from "../../interfaces/IChainAdapter.js";
import { deriveForChain, DeriveParams } from "../../utils/derivation.js";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";

/**
 * SolanaAdapter: Handles SOL address derivation, transfers, and monitoring.
 */
export class SolanaAdapter implements IChainAdapter {
  readonly chainName = "solana";
  private connection: Connection;
  private masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array) {
    const { http } = getRpcEndpoints("solana");
    this.connection = new Connection(http, "confirmed");
    this.masterSeed = masterSeed;
    ChainManager.register(this);
  }

  /**
   * Derive a Solana address (Base58 public key) using unified derivation.
   */
  async deriveAddress(params: DeriveParams): Promise<string> {
    const { priv } = deriveForChain(this.masterSeed, params);
    const keypair = Keypair.fromSeed(priv); // deterministic keypair
    return keypair.publicKey.toBase58(); // Solana address
  }

  /**
   * Send lamports from a derived address to a recipient.
   */
  async send(path: string, to: string, amount: number | bigint): Promise<{ txHash: string }> {
    const params: DeriveParams = {
      scope: "wallet",
      userId: "default",
      chain: "solana",
      index: path,
    };

    const { priv } = deriveForChain(this.masterSeed, params);
    const keypair = Keypair.fromSeed(priv);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(to),
        lamports: typeof amount === "bigint" ? Number(amount) : amount,
      })
    );

    const signature = await sendAndConfirmTransaction(this.connection, transaction, [keypair], {
      commitment: "confirmed",
    });

    return { txHash: signature };
  }

  /**
   * Monitor incoming transactions for a specific address.
   */
  async subscribe(
    address: string,
    onIncoming: (txHash: string, amount: number | bigint) => void
  ): Promise<{ unsubscribe: () => void }> {
    const seenSignatures = new Set<string>();
    const publicKey = new PublicKey(address);

    const intervalId = setInterval(async () => {
      try {
        const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit: 10 });
        for (const signatureInfo of signatures) {
          if (!seenSignatures.has(signatureInfo.signature)) {
            seenSignatures.add(signatureInfo.signature);
            onIncoming(signatureInfo.signature, 0n); // Note: amount is not retrievable here
          }
        }
      } catch (error) {
        console.error("Error in Solana subscription:", error);
      }
    }, 10_000);

    return { unsubscribe: () => clearInterval(intervalId) };
  }
}

/**
 * Register the SolanaAdapter in the ChainManager.
 */
export function registerSolanaAdapter(masterSeed: Uint8Array) {
  new SolanaAdapter(masterSeed);
}
