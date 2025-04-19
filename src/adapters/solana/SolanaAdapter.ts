// src/adapters/solana/SolanaAdapter.ts
import { IChainAdapter } from "../../interfaces/IChainAdapter.js";
import { deriveForChain, DeriveParams } from "../../utils/derivation.js";
import {
  createSolanaClient,
  createTransaction,
  signTransactionMessageWithSigners,
} from "gill";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js"; // only for keypair + instruction builders
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import Big from "big.js";

export class SolanaAdapter implements IChainAdapter {
  readonly chainName = "solana";
  private rpc: ReturnType<typeof createSolanaClient>["rpc"];
  private sendAndConfirm: ReturnType<
    typeof createSolanaClient
  >["sendAndConfirmTransaction"];
  private masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array) {
    const { http } = getRpcEndpoints("solana");
    const { rpc, sendAndConfirmTransaction } = createSolanaClient({
      urlOrMoniker: http,
    });
    this.rpc = rpc;
    this.sendAndConfirm = sendAndConfirmTransaction;
    this.masterSeed = masterSeed;
    ChainManager.register(this);
  }

  /** Derive a Base58 Solana address from our unified seed */
  async deriveAddress(params: DeriveParams): Promise<string> {
    const { priv } = deriveForChain(this.masterSeed, params);
    return Keypair.fromSeed(priv).publicKey.toBase58();
  }

  /**
   * Get the balance of a derived address.
   * Builds a gill‐compatible transaction, signs, and sends it.
   */
  async balance(params: DeriveParams): Promise<Big> {
    return new Big(0); 
  }

  /**
   * Send lamports from a derived address.
   * Builds a gill‐compatible transaction, signs, and sends it.
   */
  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{ txHash: string }> {
    // 1) Derive the signer keypair
    // const { priv } = deriveForChain(this.masterSeed, params);
    // const signer = Keypair.fromSeed(priv);

    // // 2) Prepare fields
    // const lamports = amount.toNumber();
    // const recipient = new PublicKey(to);

    // // 3) Fetch latest blockhash
    // const { value: bh } = await this.rpc.getLatestBlockhash().send();

    // // 4) Build a versioned transaction
    // const tx = createTransaction({
    //   version: "legacy",
    //   feePayer: signer.publicKey,
    //   instructions: [
    //     SystemProgram.transfer({
    //       fromPubkey: signer.publicKey,
    //       toPubkey: recipient,
    //       lamports,
    //     }),
    //   ],
    //   latestBlockhash: bh.blockhash,
    // });

    // // 5) Sign with our derived Keypair
    // const signedTx = await signTransactionMessageWithSigners(tx, [signer]);

    // // 6) Send and confirm
    // const txHash = await this.sendAndConfirm(signedTx);
    return { txHash: '' };
  }

  /**
   * Poll for new signatures every 10s on the given address (string).
   */
  async subscribe(
    address: string,
    onIncoming: (txHash: string, amount: Big) => void
  ): Promise<{ unsubscribe: () => void }> {
    // const seen = new Set<string>();

    // const id = setInterval(async () => {
    //   try {
    //     // Pass the address as a string here
    //     const sigs = await this.rpc
    //       .getSignaturesForAddress(address, { limit: 10 })
    //       .send();

    //     for (const info of sigs) {
    //       if (!seen.has(info.signature)) {
    //         seen.add(info.signature);
    //         onIncoming(info.signature, new Big(0));
    //       }
    //     }
    //   } catch (err) {
    //     console.error("[SolanaAdapter] poll error:", err);
    //   }
    // }, 10_000);

    return { unsubscribe: () => {} };
  }
}

/** Auto‐register helper */
export function registerSolanaAdapter(masterSeed: Uint8Array) {
  new SolanaAdapter(masterSeed);
}
