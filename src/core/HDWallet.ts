// src/core/HDWallet.ts
import { deriveForChain, DeriveParams } from "../utils/derivation";
import { ChainManager } from "./ChainManager";

/**
 * HDWallet wraps a master seed and provides unified derive/send/subscribe APIs
 */
export class HDWallet {
  constructor(private masterSeed: Uint8Array) {}

  /**
   * Derive an address for a given chain and parameters
   */
  async deriveAddress(params: DeriveParams): Promise<string> {
    const { address } = deriveForChain(this.masterSeed, params);
    return address;
  }

  /**
   * Send native asset from a derived address on a given chain
   */
  async send(
    params: DeriveParams,
    to: string,
    amount: bigint
  ): Promise<{ txHash: string }> {
    const adapter = ChainManager.getAdapter(params.chain);
    return adapter.send(params.index, to, amount);
  }

  /**
   * Subscribe to incoming transfers for a derived address
   */
  async subscribe(
    params: DeriveParams,
    onIncoming: (txHash: string, amount: bigint) => void
  ): Promise<{ unsubscribe: () => void }> {
    const address = await this.deriveAddress(params);
    const adapter = ChainManager.getAdapter(params.chain);
    return adapter.subscribe(address, onIncoming);
  }
}
