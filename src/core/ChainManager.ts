// src/core/ChainManager.ts
import { IChainAdapter } from "../types/index.js";

/**
 * ChainManager maintains registered adapters for each chain.
 */
export class ChainManager {
  private static adapters: Record<string, IChainAdapter> = {};

  /**
   * Register a chain adapter instance under its chainName.
   */
  public static register(adapter: IChainAdapter): void {
    ChainManager.adapters[adapter.chainName] = adapter;
  }

  /**
   * Retrieve a registered adapter for the given chain.
   * Throws if adapter is not found.
   */
  public static getAdapter(chain: string): IChainAdapter {
    const adapter = ChainManager.adapters[chain];
    if (!adapter) {
      throw new Error(`Unsupported chain: ${chain}`);
    }
    return adapter;
  }
}
