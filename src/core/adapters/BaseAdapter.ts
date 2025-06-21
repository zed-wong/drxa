import Big from "big.js";
import { EventEmitter } from "events";
import { 
  DeriveParams, 
  TransactionRequest, 
  TransactionConfig,
  TransactionResponse, 
  Balance, 
  FeeEstimate, 
  TransactionHistory, 
  SubscriptionCallback, 
  Unsubscribe,
  IncomingTransaction,
  AdapterConfig,
  ChainConfig,
  Logger,
  MetricsCollector,
  SupportedChain,
  validateDeriveParams,
  IChainAdapter
} from "../../types/index.js";
import { 
  ErrorFactory, 
  withRetry, 
  NetworkError,
  ValidationError,
  ErrorCode
} from "../errors/index.js";
import { deriveEntropy } from "../../utils/derivation.js";

export abstract class BaseAdapter extends EventEmitter implements IChainAdapter {
  protected readonly masterSeed: Uint8Array;
  protected readonly adapterConfig: AdapterConfig;
  protected readonly logger?: Logger;
  protected readonly metrics?: MetricsCollector;
  protected readonly subscriptions = new Map<string, { interval: NodeJS.Timeout; seen: Set<string> }>();
  
  abstract readonly chainName: SupportedChain;
  abstract readonly config: ChainConfig;

  constructor(
    masterSeed: Uint8Array,
    adapterConfig: AdapterConfig = {},
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    super();
    this.masterSeed = masterSeed;
    this.adapterConfig = {
      maxRetries: 3,
      timeout: 30000,
      confirmations: 1,
      pollingInterval: 15000,
      batchSize: 100,
      ...adapterConfig
    };
    this.logger = logger;
    this.metrics = metrics;
  }

  // Abstract methods that must be implemented by subclasses
  protected abstract deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string>;
  protected abstract getBalanceForAddress(address: string): Promise<Big>;
  protected abstract sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: TransactionConfig
  ): Promise<TransactionResponse>;

  // Core public methods with common logic
  async deriveAddress(params: DeriveParams): Promise<string> {
    try {
      validateDeriveParams(params);
      this.metrics?.increment('adapter.derive_address', { chain: this.chainName });
      
      const privateKey = this.derivePrivateKey(params);
      const address = await withRetry(
        () => this.deriveAddressFromPrivateKey(privateKey),
        { maxRetries: this.adapterConfig.maxRetries }
      );
      
      this.logger?.debug('Address derived', { chain: this.chainName, params, address });
      return address;
    } catch (error) {
      this.logger?.error('Failed to derive address', error as Error, { chain: this.chainName, params });
      this.metrics?.increment('adapter.derive_address.error', { chain: this.chainName });
      throw error;
    }
  }

  async balance(params: DeriveParams): Promise<Big> {
    try {
      validateDeriveParams(params);
      this.metrics?.increment('adapter.get_balance', { chain: this.chainName });
      
      const address = await this.deriveAddress(params);
      const balance = await withRetry(
        () => this.getBalanceForAddress(address),
        { maxRetries: this.adapterConfig.maxRetries }
      );
      
      this.logger?.debug('Balance retrieved', { chain: this.chainName, address, balance: balance.toString() });
      return balance;
    } catch (error) {
      this.logger?.error('Failed to get balance', error as Error, { chain: this.chainName, params });
      this.metrics?.increment('adapter.get_balance.error', { chain: this.chainName });
      throw error;
    }
  }

  async send(
    params: DeriveParams,
    to: string,
    amount: Big,
    config?: TransactionConfig
  ): Promise<TransactionResponse> {
    try {
      validateDeriveParams(params);
      this.validateAmount(amount);
      this.validateAddress(to);
      
      this.metrics?.increment('adapter.send_transaction', { chain: this.chainName });
      
      const privateKey = this.derivePrivateKey(params);
      const from = await this.deriveAddress(params);
      
      // Check balance before sending
      const balance = await this.getBalanceForAddress(from);
      if (balance.lt(amount)) {
        throw ErrorFactory.insufficientBalance(
          this.chainName,
          amount.toString(),
          balance.toString()
        );
      }
      
      const response = await withRetry(
        () => this.sendTransaction(privateKey, from, to, amount, config),
        { maxRetries: this.adapterConfig.maxRetries }
      );
      
      this.logger?.info('Transaction sent', { 
        chain: this.chainName, 
        from, 
        to, 
        amount: amount.toString(),
        txHash: response.txHash 
      });
      
      return response;
    } catch (error) {
      this.logger?.error('Failed to send transaction', error as Error, { 
        chain: this.chainName, 
        params, 
        to, 
        amount: amount.toString() 
      });
      this.metrics?.increment('adapter.send_transaction.error', { chain: this.chainName });
      throw error;
    }
  }

  // Optional method with default implementation
  async subscribe(address: string, callback: SubscriptionCallback): Promise<Unsubscribe> {
    this.validateAddress(address);
    
    if (this.subscriptions.has(address)) {
      throw new ValidationError(
        ErrorCode.INVALID_PARAMS,
        `Already subscribed to address ${address}`
      );
    }

    const seen = new Set<string>();
    const interval = setInterval(async () => {
      try {
        const transactions = await this.getIncomingTransactions(address, seen);
        for (const tx of transactions) {
          if (!seen.has(tx.txHash)) {
            seen.add(tx.txHash);
            await callback(tx);
          }
        }
      } catch (error) {
        this.logger?.error('Subscription poll error', error as Error, { 
          chain: this.chainName, 
          address 
        });
      }
    }, this.adapterConfig.pollingInterval);

    this.subscriptions.set(address, { interval, seen });

    return () => {
      const sub = this.subscriptions.get(address);
      if (sub) {
        clearInterval(sub.interval);
        this.subscriptions.delete(address);
      }
    };
  }

  // Helper methods
  protected derivePrivateKey(params: DeriveParams): Uint8Array {
    const entropy = deriveEntropy(this.masterSeed, params);
    return entropy.slice(0, 32);
  }

  protected validateAddress(address: string): void {
    if (!address || typeof address !== 'string') {
      throw ErrorFactory.validationError(
        ErrorCode.INVALID_ADDRESS,
        'Address must be a non-empty string',
        { address }
      );
    }
    // Subclasses should override for chain-specific validation
  }

  protected validateAmount(amount: Big): void {
    if (!amount || amount.lte(0)) {
      throw ErrorFactory.validationError(
        ErrorCode.INVALID_AMOUNT,
        'Amount must be greater than 0',
        { amount: amount?.toString() }
      );
    }
  }

  // Method to be overridden by adapters that support subscriptions
  protected async getIncomingTransactions(
    address: string,
    seen: Set<string>
  ): Promise<IncomingTransaction[]> {
    throw ErrorFactory.methodNotImplemented(this.chainName, 'getIncomingTransactions');
  }

  // Lifecycle methods
  async initialize(): Promise<void> {
    this.logger?.info('Adapter initialized', { chain: this.chainName });
  }

  async shutdown(): Promise<void> {
    // Clean up all subscriptions
    for (const [address, sub] of this.subscriptions) {
      clearInterval(sub.interval);
      this.logger?.debug('Subscription cleaned up', { chain: this.chainName, address });
    }
    this.subscriptions.clear();
    
    this.logger?.info('Adapter shutdown', { chain: this.chainName });
  }

  // Emit events for monitoring
  protected emitMetric(metric: string, value: number, tags?: Record<string, string>): void {
    this.emit('metric', { metric, value, tags: { chain: this.chainName, ...tags } });
  }
}