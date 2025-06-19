import Big from "big.js";

// Chain types
export type SupportedChain = 
  | 'ethereum' | 'bsc' | 'polygon' | 'avalanche' | 'arbitrum' | 'optimism' | 'fantom' | 'cronos' | 'sonic' | 'base'
  | 'bitcoin' 
  | 'solana' 
  | 'polkadot' 
  | 'cardano' 
  | 'aptos' 
  | 'sui' 
  | 'tron' 
  | 'ton' 
  | 'near' 
  | 'eos';

export type ChainCategory = 'evm' | 'utxo' | 'account' | 'other';

// Derivation types
export interface DeriveParams {
  scope: string;
  userId: string;
  chain: SupportedChain;
  index: string;
}

// Transaction types
export interface TransactionRequest {
  from?: string;
  to: string;
  amount: Big;
  data?: string;
  gasLimit?: Big;
  gasPrice?: Big;
  maxFeePerGas?: Big;
  maxPriorityFeePerGas?: Big;
  nonce?: number;
}

export interface TransactionResponse {
  txHash: string;
  blockNumber?: number;
  confirmations?: number;
  timestamp?: number;
  fee?: Big;
  status?: 'pending' | 'confirmed' | 'failed';
}

export interface TransactionReceipt {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string;
  gasUsed: Big;
  effectiveGasPrice?: Big;
  status: boolean;
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

// Balance types
export interface Balance {
  confirmed: Big;
  unconfirmed?: Big;
  locked?: Big;
  total: Big;
}

// Fee types
export interface FeeEstimate {
  baseFee: Big;
  priorityFee?: Big;
  totalFee: Big;
  gasLimit?: Big;
  gasPrice?: Big;
}

// History types
export interface TransactionHistory {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  amount: Big;
  fee: Big;
  status: 'confirmed' | 'pending' | 'failed';
  direction: 'incoming' | 'outgoing';
}

// Subscription types
export type SubscriptionCallback = (tx: IncomingTransaction) => void | Promise<void>;

export interface IncomingTransaction {
  txHash: string;
  from: string;
  to: string;
  amount: Big;
  blockNumber?: number;
  timestamp?: number;
}

export interface Unsubscribe {
  (): void | Promise<void>;
}

// Configuration types
export interface RpcEndpoint {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export interface ChainConfig {
  chainId?: string | number;
  name: string;
  symbol: string;
  decimals: number;
  category: ChainCategory;
  endpoints: {
    http: RpcEndpoint | RpcEndpoint[];
    ws?: RpcEndpoint | RpcEndpoint[];
  };
  explorer?: {
    url: string;
    apiUrl?: string;
    apiKey?: string;
  };
  feeConfig?: {
    type: 'fixed' | 'dynamic' | 'eip1559';
    multiplier?: number;
    minGasPrice?: Big;
    maxGasPrice?: Big;
  };
}

// Adapter configuration
export interface AdapterConfig {
  maxRetries?: number;
  timeout?: number;
  confirmations?: number;
  pollingInterval?: number;
  batchSize?: number;
}

// SDK Configuration
export interface SDKConfig {
  seed: string | Uint8Array;
  adapters?: {
    [chain in SupportedChain]?: AdapterConfig;
  };
  defaultConfig?: AdapterConfig;
  logger?: Logger;
  metrics?: MetricsCollector;
}

// Logger interface
export interface Logger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

// Metrics interface
export interface MetricsCollector {
  increment(metric: string, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  histogram(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, duration: number, tags?: Record<string, string>): void;
}

// Validation helpers
export function isValidChain(chain: string): chain is SupportedChain {
  const chains: SupportedChain[] = [
    'ethereum', 'bsc', 'polygon', 'avalanche', 'arbitrum', 'optimism', 'fantom', 'cronos', 'sonic', 'base',
    'bitcoin', 'solana', 'polkadot', 'cardano', 'aptos', 'sui', 'tron', 'ton', 'near', 'eos'
  ];
  return chains.includes(chain as SupportedChain);
}

export function isValidAddress(address: string, chain: SupportedChain): boolean {
  // Basic validation - should be enhanced per chain
  if (!address || typeof address !== 'string') return false;
  
  switch (chain) {
    case 'ethereum':
    case 'bsc':
    case 'polygon':
    case 'avalanche':
    case 'arbitrum':
    case 'optimism':
    case 'fantom':
    case 'cronos':
    case 'sonic':
    case 'base':
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case 'bitcoin':
      return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(address);
    case 'solana':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    default:
      return address.length > 0;
  }
}

export function validateDeriveParams(params: unknown): asserts params is DeriveParams {
  if (!params || typeof params !== 'object') {
    throw new Error('Invalid derive params: must be an object');
  }
  
  const p = params as Record<string, unknown>;
  
  if (!p.scope || typeof p.scope !== 'string') {
    throw new Error('Invalid derive params: scope must be a string');
  }
  
  if (!p.userId || typeof p.userId !== 'string') {
    throw new Error('Invalid derive params: userId must be a string');
  }
  
  if (!p.chain || !isValidChain(p.chain as string)) {
    throw new Error(`Invalid derive params: chain must be one of the supported chains`);
  }
  
  if (!p.index || typeof p.index !== 'string') {
    throw new Error('Invalid derive params: index must be a string');
  }
}