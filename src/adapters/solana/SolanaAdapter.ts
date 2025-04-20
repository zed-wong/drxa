// src/adapters/solana/SolanaAdapter.ts
import { IChainAdapter } from "../../interfaces/IChainAdapter.js";
import { deriveForChain, DeriveParams } from "../../utils/derivation.js";
import {
  createSolanaClient,
  createTransaction,
  signTransactionMessageWithSigners,
  createKeyPairSignerFromBytes,
  type Address,
  TransactionSigner,
} from "gill";
import { getTransferSolInstruction } from "gill/programs";
import Big from "big.js";
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import nacl from "tweetnacl";

export class SolanaAdapter implements IChainAdapter {
  readonly chainName = "solana";
  private rpc: ReturnType<typeof createSolanaClient>["rpc"];
  private sendAndConfirm: ReturnType<
    typeof createSolanaClient
  >["sendAndConfirmTransaction"];
  private masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array) {
    const { http } = getRpcEndpoints("solana");
    const { rpc, sendAndConfirmTransaction } = createSolanaClient({ urlOrMoniker: http });
    this.rpc = rpc;
    this.sendAndConfirm = sendAndConfirmTransaction;
    this.masterSeed = masterSeed;
    ChainManager.register(this);
  }

  /** Derive a signer from our unified seed */
  async getSigner(params: DeriveParams) {
    const { priv } = deriveForChain(this.masterSeed, params); // 32-byte seed
    const kp = nacl.sign.keyPair.fromSeed(priv); 
    return await createKeyPairSignerFromBytes(kp.secretKey);
  }

  /** Derive a Base58 Solana address from our unified seed */
  async deriveAddress(params: DeriveParams): Promise<string> {
    return (await this.getSigner(params)).address;
  }

  /** Get the balance of a derived address */
  async balance(params: DeriveParams): Promise<Big> {
    const signer = await this.getSigner(params);
    const { value } = await this.rpc.getBalance(signer.address as Address).send();
    return new Big(value.toString());
  }

  /** Send lamports from a derived address */
  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{ txHash: string }> {
    const signer = await this.getSigner(params);
    const lamports = amount.round(0).toNumber();

    const transferIx = getTransferSolInstruction({
      source: signer.address as unknown as TransactionSigner,
      destination: to as Address,
      amount: lamports,
    });

    const { value: blockhashInfo } = await this.rpc.getLatestBlockhash().send();
    const tx = createTransaction({
      version: "legacy",
      feePayer: signer.address as Address,
      instructions: [transferIx],
      latestBlockhash: blockhashInfo,
    });

    const signedTx = await signTransactionMessageWithSigners(tx);
    const txHash = await this.sendAndConfirm(signedTx);
    return { txHash };
  }

  /** Poll for new signatures every 10s on the given address */
  async subscribe(
    address: string,
    onIncoming: (txHash: string, amount: Big) => void
  ): Promise<{ unsubscribe: () => void }> {
    const addr = address as Address;
    const seen = new Set<string>();
    const intervalId = setInterval(async () => {
      try {
        const sigInfos = await this.rpc
          .getSignaturesForAddress(addr, { limit: 10 })
          .send();

        for (const info of sigInfos) {
          if (!seen.has(info.signature)) {
            seen.add(info.signature);
            onIncoming(info.signature, new Big(0));
          }
        }
      } catch (err) {
        console.error("[SolanaAdapter] poll error:", err);
      }
    }, 10_000);

    return { unsubscribe: () => clearInterval(intervalId) };
  }
}

/** Auto-register helper */
export function registerSolanaAdapter(masterSeed: Uint8Array) {
  new SolanaAdapter(masterSeed);
}
