// Simple test adapters for unit testing
import { BaseAdapter } from "../../core/adapters/BaseAdapter.js";
import { 
  SupportedChain, 
  ChainConfig, 
  AdapterConfig, 
  Logger, 
  MetricsCollector, 
  TransactionRequest, 
  TransactionResponse,
  BitcoinTransactionConfig,
  EvmTransactionConfig,
  SolanaTransactionConfig,
  TransactionConfig
} from "../../types/index.js";
import Big from "big.js";
import { AdapterRegistry } from "../../core/AdapterRegistry.js";

// Mock Bitcoin adapter for testing
export class MockBitcoinAdapter extends BaseAdapter {
  readonly chainName: SupportedChain = 'bitcoin';
  readonly config: ChainConfig = {
    name: 'Bitcoin',
    symbol: 'BTC', 
    decimals: 8,
    category: 'utxo',
    endpoints: {
      http: { url: 'https://blockstream.info/api' }
    }
  };

  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    // Generate a deterministic mock address
    const hash = Array.from(privateKey).reduce((acc, byte) => acc + byte, 0);
    return `bc1p${hash.toString(16).padStart(58, '0')}`;
  }

  protected async getBalanceForAddress(address: string): Promise<Big> {
    // Check for test error simulation flag
    if ((globalThis as any).TEST_SIMULATE_NETWORK_ERROR) {
      throw new Error('Network error');
    }
    return new Big('100000000'); // 1 BTC
  }

  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: BitcoinTransactionConfig
  ): Promise<TransactionResponse> {
    // Validate Bitcoin address format (simplified)
    if (!to || !this.isValidBitcoinAddress(to)) {
      throw new Error('Invalid Bitcoin address');
    }
    
    // Check for insufficient balance scenarios
    const balance = await this.getBalanceForAddress(from);
    if (amount.gt(balance)) {
      throw new Error('Insufficient balance for transaction');
    }
    
    // Generate unique transaction hash (include config in hash for testing)
    const hash = Array.from(privateKey).reduce((acc, byte) => acc + byte, 0);
    const randomness = Math.floor(Math.random() * 1000000);
    const configHash = config ? JSON.stringify(config).length : 0;
    const txHash = '0x' + (hash + Date.now() + randomness + configHash).toString(16).padStart(64, '0');
    
    return {
      txHash,
      status: 'pending',
      fee: config?.feeRate || config?.satPerVByte || new Big('1000') // Mock fee
    };
  }

  private isValidBitcoinAddress(address: string): boolean {
    if (!address || address.length < 25 || address.length > 90) return false;
    // Basic Bitcoin address validation
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/.test(address);
  }
}

// Mock Ethereum adapter for testing
export class MockEthereumAdapter extends BaseAdapter {
  readonly chainName: SupportedChain = 'ethereum';
  readonly config: ChainConfig = {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    category: 'evm',
    endpoints: {
      http: { url: 'https://eth.llamarpc.com' }
    }
  };

  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    // Generate a deterministic mock address
    const hash = Array.from(privateKey).reduce((acc, byte) => acc + byte, 0);
    return `0x${hash.toString(16).padStart(40, '0')}`;
  }

  protected async getBalanceForAddress(address: string): Promise<Big> {
    // Check for test error simulation flag
    if ((globalThis as any).TEST_SIMULATE_NETWORK_ERROR) {
      throw new Error('Network error');
    }
    return new Big('1000000000000000000'); // 1 ETH
  }

  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: EvmTransactionConfig
  ): Promise<TransactionResponse> {
    // Validate Ethereum address format
    if (!to || !this.isValidEthereumAddress(to)) {
      throw new Error('Invalid Ethereum address');
    }
    
    // Check for insufficient balance scenarios
    const balance = await this.getBalanceForAddress(from);
    if (amount.gt(balance)) {
      throw new Error('Insufficient balance for transaction');
    }
    
    // Generate unique transaction hash (include config in hash for testing)
    const hash = Array.from(privateKey).reduce((acc, byte) => acc + byte, 0);
    const randomness = Math.floor(Math.random() * 1000000);
    const configHash = config ? JSON.stringify(config).length : 0;
    const txHash = '0x' + (hash + Date.now() + randomness + configHash).toString(16).padStart(64, '0');
    
    return {
      txHash,
      status: 'pending',
      fee: config?.gasPrice || config?.maxFeePerGas || new Big('20000000000') // Mock gas fee
    };
  }

  private isValidEthereumAddress(address: string): boolean {
    if (!address) return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}

// Mock Solana adapter for testing
export class MockSolanaAdapter extends BaseAdapter {
  readonly chainName: SupportedChain = 'solana';
  readonly config: ChainConfig = {
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    category: 'account',
    endpoints: {
      http: { url: 'https://api.mainnet-beta.solana.com' }
    }
  };

  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    // Generate a deterministic mock address
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    let hash = Array.from(privateKey).reduce((acc, byte) => acc + byte, 0);
    
    for (let i = 0; i < 44; i++) {
      result += chars[hash % chars.length];
      hash = Math.floor(hash / chars.length) + 1;
    }
    
    return result;
  }

  protected async getBalanceForAddress(address: string): Promise<Big> {
    // Check for test error simulation flag
    if ((globalThis as any).TEST_SIMULATE_NETWORK_ERROR) {
      throw new Error('Network error');
    }
    return new Big('5000000000'); // 5 SOL
  }

  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: SolanaTransactionConfig
  ): Promise<TransactionResponse> {
    // Validate Solana address format
    if (!to || !this.isValidSolanaAddress(to)) {
      throw new Error('Invalid Solana address');
    }
    
    // Check for insufficient balance scenarios
    const balance = await this.getBalanceForAddress(from);
    if (amount.gt(balance)) {
      throw new Error('Insufficient balance for transaction');
    }
    
    // Generate unique transaction hash (include config in hash for testing)
    const hash = Array.from(privateKey).reduce((acc, byte) => acc + byte, 0);
    const randomness = Math.floor(Math.random() * 1000000);
    const configHash = config ? JSON.stringify(config).length : 0;
    const txHash = (hash + Date.now() + randomness + configHash).toString(16).padStart(64, '0');
    
    return {
      txHash,
      status: 'pending',
      fee: config?.computeUnitPrice || new Big('5000') // Mock SOL fee in lamports
    };
  }

  private isValidSolanaAddress(address: string): boolean {
    if (!address) return false;
    // Basic Solana address validation (base58 encoded, ~32-44 chars)
    // Base58 excludes 0, O, I, and l to avoid confusion
    return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{32,44}$/.test(address);
  }
}

// Adapter constructors for the registry
export class MockBitcoinAdapterConstructor {
  static readonly chainName = 'bitcoin' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new MockBitcoinAdapter(masterSeed, config, logger, metrics);
  }
}

export class MockEthereumAdapterConstructor {
  static readonly chainName = 'ethereum' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new MockEthereumAdapter(masterSeed, config, logger, metrics);
  }
}

export class MockSolanaAdapterConstructor {
  static readonly chainName = 'solana' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new MockSolanaAdapter(masterSeed, config, logger, metrics);
  }
}

// Register all mock adapters for testing
export function registerMockAdapters(registry: AdapterRegistry): void {
  registry.registerAdapter(MockBitcoinAdapterConstructor as any);
  registry.registerAdapter(MockEthereumAdapterConstructor as any);
  registry.registerAdapter(MockSolanaAdapterConstructor as any);
}