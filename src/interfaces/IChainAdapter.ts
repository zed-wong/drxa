import { DeriveParams } from "../utils/derivation";

// src/interfaces/IChainAdapter.ts
export interface IChainAdapter {
  /** Unique chain identifier, e.g. "ethereum" */
  chainName: string;

  /** Derive a wallet address from a derivation path or parameters */
  deriveAddress(params: DeriveParams): Promise<string>;

  /**
   * Send a native asset transaction from a derived address.
   * @param path derivation path or identifier
   * @param to destination address
   * @param amount amount in smallest unit (e.g., wei, lamports)
   */
  send(
    path: string,
    to: string,
    amount: number | bigint
  ): Promise<{ txHash: string }>;

  /**
   * Subscribe to incoming transfers for the given address.
   * Returns an unsubscribe handle.
   */
  subscribe(
    address: string,
    onIncoming: (txHash: string, amount: number | bigint) => void
  ): Promise<{ unsubscribe: () => void }>;
}
