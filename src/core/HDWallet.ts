// src/core/HDWallet.ts
import Big from "big.js";
import { AdapterRegistry } from "./AdapterRegistry.js";
import { 
  DeriveParams, 
  TransactionRequest, 
  TransactionResponse, 
  FeeEstimate, 
  TransactionHistory, 
  SubscriptionCallback, 
  Unsubscribe,
  Logger, 
  MetricsCollector,
  validateDeriveParams,
  SupportedChain
} from "../types/index.js";
import { ErrorFactory, withRetry } from "./errors/index.js";

/**
 * HDWallet wraps a master seed and provides unified derive/send/subscribe APIs
 * Uses the new adapter registry for lazy loading and better resource management
 */
export class HDWallet {
  private readonly masterSeed: Uint8Array;
  private readonly registry: AdapterRegistry;
  private readonly logger?: Logger;
  private readonly metrics?: MetricsCollector;

  constructor(
    masterSeed: Uint8Array,
    registry: AdapterRegistry,
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    this.masterSeed = masterSeed;
    this.registry = registry;
    this.logger = logger;
    this.metrics = metrics;
  }

  /**
   * Derive an address for a given chain and parameters
   */
  async deriveAddress(params: DeriveParams): Promise<string> {
    validateDeriveParams(params);
    this.metrics?.increment('wallet.derive_address', { chain: params.chain });
    
    try {
      const adapter = await this.registry.loadAdapter(params.chain);
      const address = await adapter.deriveAddress(params);
      
      this.logger?.debug('Address derived', { 
        chain: params.chain, 
        scope: params.scope, 
        userId: params.userId, 
        index: params.index,
        address 
      });
      
      return address;
    } catch (error) {
      this.logger?.error('Failed to derive address', error as Error, { params });
      this.metrics?.increment('wallet.derive_address.error', { chain: params.chain });
      throw error;
    }
  }

  /**
   * Get balance for a derived address
   */
  async balance(params: DeriveParams): Promise<Big> {
    validateDeriveParams(params);
    this.metrics?.increment('wallet.get_balance', { chain: params.chain });
    
    try {
      const adapter = await this.registry.loadAdapter(params.chain);
      const balance = await adapter.balance(params);
      
      this.logger?.debug('Balance retrieved', { 
        chain: params.chain, 
        params, 
        balance: balance.toString() 
      });
      
      return balance;
    } catch (error) {
      this.logger?.error('Failed to get balance', error as Error, { params });
      this.metrics?.increment('wallet.get_balance.error', { chain: params.chain });
      throw error;
    }
  }

  /**
   * Send native asset from a derived address on a given chain
   */
  async send(
    params: DeriveParams,
    to: string,
    amount: Big,
    config?: TransactionRequest
  ): Promise<TransactionResponse> {
    validateDeriveParams(params);
    this.metrics?.increment('wallet.send_transaction', { chain: params.chain });
    
    try {
      const adapter = await this.registry.loadAdapter(params.chain);
      const response = await adapter.send(params, to, amount, config);
      
      this.logger?.info('Transaction sent', { 
        chain: params.chain, 
        params, 
        to, 
        amount: amount.toString(),
        txHash: response.txHash 
      });
      
      return response;
    } catch (error) {
      this.logger?.error('Failed to send transaction', error as Error, { params, to, amount: amount.toString() });
      this.metrics?.increment('wallet.send_transaction.error', { chain: params.chain });
      throw error;
    }
  }

  /**
   * Estimate transaction fee
   */
  async estimateFee(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<FeeEstimate> {
    validateDeriveParams(params);
    
    const adapter = await this.registry.loadAdapter(params.chain);
    if (!adapter.estimateFee) {
      throw ErrorFactory.methodNotImplemented(params.chain, 'estimateFee');
    }
    
    return adapter.estimateFee(params, to, amount);
  }

  /**
   * Get transaction history for a derived address
   */
  async getHistory(params: DeriveParams, limit = 100): Promise<TransactionHistory[]> {
    validateDeriveParams(params);
    
    const adapter = await this.registry.loadAdapter(params.chain);
    if (!adapter.getHistory) {
      throw ErrorFactory.methodNotImplemented(params.chain, 'getHistory');
    }
    
    return adapter.getHistory(params, limit);
  }

  /**
   * Subscribe to incoming transfers for a derived address
   */
  async subscribe(
    params: DeriveParams,
    callback: SubscriptionCallback
  ): Promise<Unsubscribe> {
    validateDeriveParams(params);
    this.metrics?.increment('wallet.subscribe', { chain: params.chain });
    
    try {
      const address = await this.deriveAddress(params);
      const adapter = await this.registry.loadAdapter(params.chain);
      
      if (!adapter.subscribe) {
        throw ErrorFactory.methodNotImplemented(params.chain, 'subscribe');
      }
      
      const unsubscribe = await adapter.subscribe(address, callback);
      
      this.logger?.info('Subscription created', { 
        chain: params.chain, 
        params, 
        address 
      });
      
      return unsubscribe;
    } catch (error) {
      this.logger?.error('Failed to create subscription', error as Error, { params });
      this.metrics?.increment('wallet.subscribe.error', { chain: params.chain });
      throw error;
    }
  }

  /**
   * Check if a chain is supported
   */
  hasChain(chain: SupportedChain): boolean {
    return this.registry.hasAdapter(chain);
  }

  /**
   * Get list of supported chains
   */
  getSupportedChains(): SupportedChain[] {
    return this.registry.getRegisteredChains();
  }

  /**
   * Preload adapters for multiple chains
   */
  async preloadAdapters(chains: SupportedChain[]): Promise<void> {
    const promises = chains.map(chain => 
      this.registry.loadAdapter(chain).catch(error => 
        this.logger?.warn(`Failed to preload adapter for ${chain}`, { error })
      )
    );
    
    await Promise.all(promises);
    this.logger?.info('Adapters preloaded', { chains });
  }

  /**
   * Batch operations across multiple chains
   */
  async batchBalance(requests: DeriveParams[]): Promise<{ params: DeriveParams; balance: Big; error?: Error }[]> {
    const results = await Promise.allSettled(
      requests.map(async params => ({
        params,
        balance: await this.balance(params)
      }))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          params: requests[index],
          balance: new Big(0),
          error: result.reason
        };
      }
    });
  }

  /**
   * Get wallet statistics
   */
  getStats() {
    return {
      supportedChains: this.getSupportedChains().length,
      loadedAdapters: this.registry.getLoadedAdapters().size,
      registryStats: this.registry.getStats()
    };
  }
}
