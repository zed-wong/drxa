import Big from "big.js";

// Chain types
export type SupportedChain = 
  | 'ethereum' | 'bsc' | 'polygon' | 'avalanche' | 'arbitrum' | 'optimism' | 'cronos' | 'sonic' | 'base'
  | 'bitcoin' 
  | 'solana' 
  | 'polkadot' 
  | 'cardano' 
  | 'aptos' 
  | 'sui' 
  | 'tron' 
  | 'ton' 
  | 'near';

export type ChainCategory = 'evm' | 'utxo' | 'account' | 'other';

// Derivation types
export interface DeriveParams {
  scope: string;
  userId: string;
  chain: SupportedChain;
  index: string;
}

// Transaction types
// Base transaction configuration
export interface BaseTransactionConfig {
  // Common fields
  memo?: string;
  data?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  
  // Fee configuration
  feeRate?: Big;
  customFee?: Big;
  
  // Advanced options
  confirmations?: number;
  timeout?: number;
  rbf?: boolean; // Replace-by-fee for Bitcoin
}

// EVM-specific transaction configuration
export interface EvmTransactionConfig extends BaseTransactionConfig {
  // Transaction recipient
  to?: string;
  
  // Gas configuration
  gasLimit?: Big;
  gasPrice?: Big;
  
  // EIP-1559 fee configuration
  maxFeePerGas?: Big;
  maxPriorityFeePerGas?: Big;
  
  // Transaction options
  nonce?: number;
  chainId?: number;
  type?: 0 | 1 | 2; // Legacy, EIP-2930, EIP-1559
  
  // Contract interaction
  data?: string;
  value?: Big;
}

// Bitcoin-specific transaction configuration
export interface BitcoinTransactionConfig extends BaseTransactionConfig {
  // Fee configuration
  feeRate?: Big; // satoshis per byte
  satPerVByte?: Big; // satoshis per virtual byte
  
  // UTXO selection
  utxoSelection?: 'auto' | 'manual' | 'largest-first' | 'smallest-first';
  specificUtxos?: string[]; // specific UTXO transaction IDs
  
  // Script types
  scriptType?: 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr';
  
  // Advanced options
  rbf?: boolean; // Replace-by-fee
  lockTime?: number;
  sequence?: number;
}

// Solana-specific transaction configuration
export interface SolanaTransactionConfig extends BaseTransactionConfig {
  // Fee configuration
  computeUnits?: number;
  computeUnitPrice?: Big; // microlamports per compute unit
  
  // Transaction options
  recentBlockhash?: string;
  feePayer?: string;
  
  // Advanced options
  skipPreflight?: boolean;
  preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
  maxRetries?: number;
}

// TON-specific transaction configuration
export interface TonTransactionConfig extends BaseTransactionConfig {
  // Fee configuration
  gasLimit?: Big;
  gasPrice?: Big;
  
  // Message options
  bounce?: boolean;
  mode?: number;
  
  // Advanced options
  validUntil?: number;
  seqno?: number;
}


// NEAR-specific transaction configuration
export interface NearTransactionConfig extends BaseTransactionConfig {
  // Gas configuration
  gas?: Big;
  attachedDeposit?: Big;
  
  // Transaction options
  blockHash?: string;
  nonce?: number;
  
  // Function call options (for contract calls)
  methodName?: string;
  args?: any;
}

// Aptos-specific transaction configuration
export interface AptosTransactionConfig extends BaseTransactionConfig {
  // Gas configuration
  gasUnitPrice?: Big;
  maxGasAmount?: Big;
  
  // Transaction options
  sequenceNumber?: number;
  expirationTimestampSecs?: number;
  
  // Multi-sig options
  secondarySigners?: string[];
}

// Cardano-specific transaction configuration
export interface CardanoTransactionConfig extends BaseTransactionConfig {
  // Fee configuration
  fee?: Big;
  
  // UTXO configuration
  inputs?: Array<{
    txHash: string;
    outputIndex: number;
  }>;
  
  // Advanced options
  ttl?: number; // Time to live
  auxiliaryData?: any;
  validityIntervalStart?: number;
}

// Union type for all transaction configurations
export type TransactionConfig = 
  | EvmTransactionConfig
  | BitcoinTransactionConfig  
  | SolanaTransactionConfig
  | TonTransactionConfig
  | NearTransactionConfig
  | AptosTransactionConfig
  | CardanoTransactionConfig
  | BaseTransactionConfig;

// Legacy interface for backward compatibility
export interface TransactionRequest extends EvmTransactionConfig {
  from?: string;
  to: string;
  amount: Big;
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
  tokenContract?: string;
  data?: string;
  logIndex?: number;
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
  tokenContract?: string;
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

// Chain Adapter Interface
export interface IChainAdapter {
  readonly chainName: SupportedChain;
  readonly config: ChainConfig;
  
  // Core methods
  deriveAddress(params: DeriveParams): Promise<string>;
  balance(params: DeriveParams): Promise<Big>;
  send(params: DeriveParams, to: string, amount: Big, config?: TransactionConfig): Promise<TransactionResponse>;
  
  // Optional methods
  estimateFee?(params: DeriveParams, to: string, amount: Big, config?: TransactionConfig): Promise<FeeEstimate>;
  sign?(params: DeriveParams, tx: TransactionConfig): Promise<string>;
  getHistory?(params: DeriveParams, limit?: number): Promise<TransactionHistory[]>;
  fetchLatestTx?(params: DeriveParams): Promise<TransactionResponse | null>;
  subscribe?(address: string, callback: SubscriptionCallback): Promise<Unsubscribe>;
  
  // Lifecycle
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
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
    'ethereum', 'bsc', 'polygon', 'avalanche', 'arbitrum', 'optimism', 'cronos', 'sonic', 'base',
    'bitcoin', 'solana', 'polkadot', 'cardano', 'aptos', 'sui', 'tron', 'ton', 'near'
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