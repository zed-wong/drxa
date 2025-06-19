/**
 * Plugin Architecture Example
 * 
 * This example demonstrates how to create custom adapters and plugins
 * for the drxa SDK, showcasing the extensible plugin architecture.
 */

import { BaseAdapter } from '../src/core/adapters/BaseAdapter.js';
import { AdapterRegistry } from '../src/core/AdapterRegistry.js';
import { 
  DeriveParams,
  TransactionRequest,
  TransactionResponse,
  ChainConfig,
  SupportedChain,
  Logger,
  MetricsCollector
} from '../src/types/index.js';
import Big from 'big.js';
import crypto from 'crypto';

// Example 1: Create a Custom Chain Adapter
class CustomChainAdapter extends BaseAdapter {
  readonly chainName: SupportedChain = 'custom' as SupportedChain;
  readonly config: ChainConfig = {
    name: 'CustomChain',
    symbol: 'CUSTOM',
    decimals: 18,
    category: 'other',
    endpoints: {
      http: { url: 'https://api.customchain.network/v1' }
    }
  };
  
  constructor(
    masterSeed: Uint8Array,
    config?: Partial<ChainConfig>,
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    super(masterSeed, config, logger, metrics);
    console.log('🔌 Custom Chain Adapter initialized');
  }
  
  // Required: Implement address derivation from private key
  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    // Custom address derivation logic for your blockchain
    const hash = crypto.createHash('sha256').update(privateKey).digest();
    const address = 'custom' + hash.toString('hex').substring(0, 40);
    
    this.logger?.debug('Derived custom address', { address });
    return address;
  }
  
  // Required: Implement balance fetching
  protected async getBalanceForAddress(address: string): Promise<Big> {
    try {
      // Simulate API call to custom blockchain
      this.logger?.debug('Fetching balance for custom address', { address });
      
      // In real implementation, make HTTP request to your blockchain API
      const response = await this.makeHttpRequest('/balance/' + address);
      const balance = new Big(response.balance || '0');
      
      this.logger?.info('Balance fetched successfully', { address, balance: balance.toString() });
      return balance;
    } catch (error) {
      this.handleError('getBalance', error as Error, { address });
      throw error;
    }
  }
  
  // Required: Implement transaction sending
  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: TransactionRequest
  ): Promise<{ txHash: string; status: string }> {
    try {
      this.logger?.info('Sending custom chain transaction', { from, to, amount: amount.toString() });
      
      // Create transaction payload
      const transaction = {
        from,
        to,
        amount: amount.toString(),
        timestamp: Date.now(),
        fee: config?.fee || '1000',
        nonce: config?.nonce || Math.floor(Math.random() * 1000000)
      };
      
      // Sign transaction (simplified for example)
      const signature = this.signTransaction(transaction, privateKey);
      
      // Broadcast transaction
      const response = await this.makeHttpRequest('/broadcast', {
        method: 'POST',
        body: JSON.stringify({ ...transaction, signature })
      });
      
      const result = { txHash: response.txHash, status: 'pending' };
      this.logger?.info('Transaction sent successfully', result);
      
      return result;
    } catch (error) {
      this.handleError('sendTransaction', error as Error, { from, to, amount: amount.toString() });
      throw error;
    }
  }
  
  // Optional: Implement fee estimation
  async estimateFee(params: DeriveParams, to: string, amount: Big): Promise<any> {
    this.logger?.debug('Estimating fee for custom chain', { to, amount: amount.toString() });
    
    // Custom fee estimation logic
    const baseFee = new Big('1000');
    const sizeFee = new Big(amount.toString().length * 10);
    const totalFee = baseFee.plus(sizeFee);
    
    return {
      baseFee,
      sizeFee,
      totalFee,
      gasLimit: new Big('21000'),
      gasPrice: new Big('20')
    };
  }
  
  // Optional: Implement transaction history
  async getHistory(params: DeriveParams, limit = 50): Promise<any[]> {
    const address = await this.deriveAddress(params);
    this.logger?.debug('Fetching transaction history', { address, limit });
    
    try {
      const response = await this.makeHttpRequest(`/history/${address}?limit=${limit}`);
      return response.transactions || [];
    } catch (error) {
      this.logger?.warn('Failed to fetch history', error as Error);
      return [];
    }
  }
  
  // Optional: Implement subscriptions
  async subscribe(address: string, callback: (tx: any) => void): Promise<() => void> {
    this.logger?.info('Setting up subscription for custom chain', { address });
    
    // Simulate WebSocket connection
    const intervalId = setInterval(async () => {
      try {
        // Poll for new transactions (in real implementation, use WebSocket)
        const response = await this.makeHttpRequest(`/recent/${address}`);
        if (response.newTransactions?.length > 0) {
          response.newTransactions.forEach(callback);
        }
      } catch (error) {
        this.logger?.error('Subscription polling error', error as Error);
      }
    }, 5000);
    
    // Return unsubscribe function
    return () => {
      clearInterval(intervalId);
      this.logger?.info('Unsubscribed from custom chain', { address });
    };
  }
  
  // Helper methods
  private signTransaction(transaction: any, privateKey: Uint8Array): string {
    const data = JSON.stringify(transaction);
    return crypto.createHmac('sha256', privateKey).update(data).digest('hex');
  }
  
  private async makeHttpRequest(endpoint: string, options?: any): Promise<any> {
    // Simulate HTTP request (replace with actual implementation)
    const url = this.config.endpoints.http.url + endpoint;
    
    // In real implementation, use fetch or axios
    return new Promise((resolve) => {
      setTimeout(() => {
        // Mock response
        resolve({
          balance: '1000000000000000000', // 1 CUSTOM token
          txHash: '0x' + crypto.randomBytes(32).toString('hex'),
          transactions: [],
          newTransactions: []
        });
      }, 100);
    });
  }
}

// Example 2: Create an Adapter Constructor for Registry
class CustomChainAdapterConstructor {
  static readonly chainName = 'custom';
  
  constructor(
    masterSeed: Uint8Array,
    config?: Partial<ChainConfig>,
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    return new CustomChainAdapter(masterSeed, config, logger, metrics);
  }
}

// Example 3: Create a Plugin Package
class PluginPackage {
  static adapters = [
    CustomChainAdapterConstructor
  ];
  
  static register(registry: AdapterRegistry) {
    console.log('📦 Registering custom plugin package...');
    
    this.adapters.forEach(adapterConstructor => {
      registry.registerAdapter(adapterConstructor as any);
      console.log(`  ✅ Registered ${adapterConstructor.chainName} adapter`);
    });
  }
}

// Example 4: Advanced Custom Adapter with Business Logic
class TradingAdapter extends BaseAdapter {
  readonly chainName: SupportedChain = 'trading' as SupportedChain;
  readonly config: ChainConfig = {
    name: 'Trading Platform',
    symbol: 'TRADE',
    decimals: 8,
    category: 'other',
    endpoints: {
      http: { url: 'https://api.trading-platform.com' }
    }
  };
  
  private tradingPairs = new Map<string, number>();
  
  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    // Generate trading account ID
    const hash = crypto.createHash('sha256').update(privateKey).digest();
    return 'trade_' + hash.toString('hex').substring(0, 16);
  }
  
  protected async getBalanceForAddress(address: string): Promise<Big> {
    // Return trading account balance
    return new Big('1000000'); // 10 TRADE tokens
  }
  
  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: any
  ): Promise<{ txHash: string; status: string }> {
    // Implement trading order placement
    const orderId = crypto.randomBytes(16).toString('hex');
    
    this.logger?.info('Placing trading order', {
      from,
      to,
      amount: amount.toString(),
      orderId
    });
    
    return {
      txHash: orderId,
      status: 'executed'
    };
  }
  
  // Custom trading-specific methods
  async placeLimitOrder(
    params: DeriveParams,
    pair: string,
    side: 'buy' | 'sell',
    amount: Big,
    price: Big
  ): Promise<string> {
    const account = await this.deriveAddress(params);
    const orderId = crypto.randomBytes(16).toString('hex');
    
    this.logger?.info('Placing limit order', {
      account,
      pair,
      side,
      amount: amount.toString(),
      price: price.toString(),
      orderId
    });
    
    return orderId;
  }
  
  async getOrderBook(pair: string): Promise<any> {
    this.logger?.debug('Fetching order book', { pair });
    
    return {
      bids: [{ price: '100', amount: '1.5' }],
      asks: [{ price: '101', amount: '2.0' }]
    };
  }
}

// Example 5: Multi-Chain Wrapper Adapter
class MultiChainWrapper extends BaseAdapter {
  readonly chainName: SupportedChain = 'multichain' as SupportedChain;
  readonly config: ChainConfig = {
    name: 'Multi-Chain Wrapper',
    symbol: 'MULTI',
    decimals: 18,
    category: 'wrapper',
    endpoints: {
      http: { url: 'https://multichain-api.com' }
    }
  };
  
  private wrappedChains = ['bitcoin', 'ethereum', 'solana'];
  
  constructor(
    masterSeed: Uint8Array,
    private registry: AdapterRegistry,
    config?: Partial<ChainConfig>,
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    super(masterSeed, config, logger, metrics);
  }
  
  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    // Generate a multi-chain address
    const hash = crypto.createHash('sha256').update(privateKey).digest();
    return 'multi_' + hash.toString('hex').substring(0, 32);
  }
  
  protected async getBalanceForAddress(address: string): Promise<Big> {
    // Aggregate balances from multiple chains
    let totalBalance = new Big('0');
    
    for (const chain of this.wrappedChains) {
      try {
        const adapter = await this.registry.loadAdapter(chain as SupportedChain);
        const chainBalance = await adapter.balance({
          scope: 'multichain',
          userId: address,
          chain: chain as SupportedChain,
          index: '0'
        });
        
        // Convert to USD equivalent (simplified)
        const usdValue = this.convertToUSD(chain, chainBalance);
        totalBalance = totalBalance.plus(usdValue);
      } catch (error) {
        this.logger?.warn(`Failed to get balance for ${chain}`, error as Error);
      }
    }
    
    return totalBalance;
  }
  
  protected async sendTransaction(): Promise<{ txHash: string; status: string }> {
    throw new Error('Multi-chain wrapper does not support direct transactions');
  }
  
  // Custom multi-chain methods
  async getBalanceBreakdown(params: DeriveParams): Promise<Record<string, string>> {
    const breakdown: Record<string, string> = {};
    
    for (const chain of this.wrappedChains) {
      try {
        const adapter = await this.registry.loadAdapter(chain as SupportedChain);
        const balance = await adapter.balance({
          ...params,
          chain: chain as SupportedChain
        });
        breakdown[chain] = balance.toString();
      } catch (error) {
        breakdown[chain] = '0';
      }
    }
    
    return breakdown;
  }
  
  private convertToUSD(chain: string, amount: Big): Big {
    // Simplified conversion rates
    const rates: Record<string, number> = {
      bitcoin: 45000,
      ethereum: 3000,
      solana: 100
    };
    
    const rate = rates[chain] || 1;
    return amount.times(rate);
  }
}

// Example Usage Function
async function demonstratePluginArchitecture() {
  console.log('🔌 drxa SDK Plugin Architecture Examples');
  console.log('=========================================\n');
  
  // Initialize registry
  const masterSeed = new Uint8Array(32);
  crypto.randomFillSync(masterSeed);
  
  const registry = AdapterRegistry.getInstance();
  registry.initialize(masterSeed);
  
  // Example 1: Register single custom adapter
  console.log('📝 Example 1: Registering Custom Adapter\n');
  
  registry.registerAdapter(CustomChainAdapterConstructor as any);
  console.log('✅ Custom chain adapter registered\n');
  
  // Example 2: Register plugin package
  console.log('📝 Example 2: Registering Plugin Package\n');
  
  PluginPackage.register(registry);
  console.log('✅ Plugin package registered\n');
  
  // Example 3: Use custom adapter
  console.log('📝 Example 3: Using Custom Adapter\n');
  
  try {
    const customAdapter = await registry.loadAdapter('custom' as SupportedChain);
    
    const address = await customAdapter.deriveAddress({
      scope: 'plugin-demo',
      userId: 'demo-user',
      chain: 'custom' as SupportedChain,
      index: '0'
    });
    
    console.log(`Custom address: ${address}`);
    
    const balance = await customAdapter.balance({
      scope: 'plugin-demo',
      userId: 'demo-user',
      chain: 'custom' as SupportedChain,
      index: '0'
    });
    
    console.log(`Custom balance: ${balance.toString()}\n`);
    
  } catch (error) {
    console.error('Failed to use custom adapter:', error);
  }
  
  // Example 4: Advanced adapter with business logic
  console.log('📝 Example 4: Advanced Trading Adapter\n');
  
  const tradingAdapter = new TradingAdapter(masterSeed);
  
  const tradingAccount = await tradingAdapter.deriveAddress({
    scope: 'trading',
    userId: 'trader-123',
    chain: 'trading' as SupportedChain,
    index: '0'
  });
  
  console.log(`Trading account: ${tradingAccount}`);
  
  const orderId = await tradingAdapter.placeLimitOrder(
    {
      scope: 'trading',
      userId: 'trader-123',
      chain: 'trading' as SupportedChain,
      index: '0'
    },
    'BTC/USD',
    'buy',
    new Big('0.1'),
    new Big('45000')
  );
  
  console.log(`Order placed: ${orderId}`);
  
  const orderBook = await tradingAdapter.getOrderBook('BTC/USD');
  console.log('Order book:', JSON.stringify(orderBook, null, 2));
  
  console.log('\n✅ All plugin architecture examples completed!');
}

// Run the demonstration
demonstratePluginArchitecture().catch(console.error);