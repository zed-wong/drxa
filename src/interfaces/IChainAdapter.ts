// src/interfaces/IChainAdapter.ts
import Big from "big.js";
import { DeriveParams } from "../utils/derivation.js";

export interface IChainAdapter {
  /** Unique chain identifier, e.g. "ethereum" */
  chainName: string;

  /** Derive a wallet address from a derivation path or parameters */
  deriveAddress(params: DeriveParams): Promise<string>;


  /**
   * Get the balance of a derived address.
   * @param params derivation path or identifier
   */
  balance(params: DeriveParams): Promise<Big>;

  /**
   * Send a native asset transaction from a derived address.
   * @param params derivation path or identifier
   * @param to destination address
   * @param amount amount in smallest unit (e.g., wei, lamports)
   */
  send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{ txHash: string }>;


  estimateFee?(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{
    fee: unknown;
  }>;

  /**
   * Get the transaction history for a derived address.
   * @param params derivation path or identifier
   */
  getHistory?(params: DeriveParams): Promise<Array<{ txHash: string; amount: Big }>>;

  /**
   * Subscribe to incoming transfers for the given address.
   * Returns an unsubscribe handle.
   */
  subscribe(
    address: string,
    onIncoming: (txHash: string, amount: Big) => void
  ): Promise<{ unsubscribe: () => void }>;
}
