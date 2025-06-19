import { BaseAdapter } from "../../core/adapters/BaseAdapter.js";
import { 
  SupportedChain, 
  ChainConfig, 
  AdapterConfig, 
  Logger, 
  MetricsCollector, 
  TransactionRequest, 
  TransactionResponse,
  FeeEstimate,
  TransactionHistory,
  IncomingTransaction,
  EvmTransactionConfig
} from "../../types/index.js";
import Big from "big.js";
import { ethers } from "ethers";
import * as secp256k1 from "@noble/secp256k1";
import { keccak256 } from "js-sha3";

/**
 * Enhanced EVM adapter supporting multiple EVM-compatible chains
 * with improved error handling, type safety, and resource management
 */
export class EvmAdapterV2 extends BaseAdapter {
  readonly chainName: SupportedChain;
  readonly config: ChainConfig;
  
  private provider: ethers.providers.JsonRpcProvider;
  private wsProvider?: ethers.providers.WebSocketProvider;

  constructor(
    chainName: SupportedChain,
    config: ChainConfig,
    masterSeed: Uint8Array,
    adapterConfig: AdapterConfig = {},
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    super(masterSeed, adapterConfig, logger, metrics);
    
    this.chainName = chainName;
    this.config = config;

    // Initialize providers
    const httpEndpoint = Array.isArray(config.endpoints.http) 
      ? config.endpoints.http[0] 
      : config.endpoints.http;
    
    this.provider = new ethers.providers.JsonRpcProvider(
      httpEndpoint.url,
      { 
        chainId: config.chainId as number,
        name: config.name 
      }
    );

    // Initialize WebSocket provider if available
    if (config.endpoints.ws) {
      const wsEndpoint = Array.isArray(config.endpoints.ws)
        ? config.endpoints.ws[0]
        : config.endpoints.ws;
      
      this.wsProvider = new ethers.providers.WebSocketProvider(
        wsEndpoint.url,
        { 
          chainId: config.chainId as number,
          name: config.name 
        }
      );

      // Handle WebSocket connection errors
      this.wsProvider.on('error', (error) => {
        this.logger?.error('WebSocket provider error', error, { chain: this.chainName });
      });
    }
  }

  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    try {
      // Generate public key from private key using secp256k1
      const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed
      
      // Remove the 0x04 prefix for uncompressed key
      const publicKeyBytes = publicKey.slice(1);
      
      // Generate Ethereum address using Keccak256
      const hash = keccak256(publicKeyBytes);
      const address = '0x' + hash.slice(-40); // Last 20 bytes
      
      return ethers.utils.getAddress(address); // Checksum the address
    } catch (error) {
      this.logger?.error('Failed to derive EVM address', error as Error, { 
        chain: this.chainName,
        privateKeyLength: privateKey.length 
      });
      throw error;
    }
  }

  protected async getBalanceForAddress(address: string): Promise<Big> {
    try {
      const balance = await this.provider.getBalance(address);
      return new Big(balance.toString());
    } catch (error) {
      this.logger?.error('Failed to get EVM balance', error as Error, { 
        chain: this.chainName,
        address 
      });
      throw error;
    }
  }

  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: EvmTransactionConfig
  ): Promise<TransactionResponse> {
    try {
      // Validate Ethereum address format
      this.validateEvmAddress(to);
      
      // Create wallet from private key
      const wallet = new ethers.Wallet(
        '0x' + Buffer.from(privateKey).toString('hex'),
        this.provider
      );

      // Get current gas price and nonce (allow override from config)
      const [gasPrice, currentNonce] = await Promise.all([
        this.getOptimalGasPrice(),
        this.provider.getTransactionCount(from, 'pending')
      ]);

      // Use configured nonce or current nonce
      const nonce = config?.nonce !== undefined ? config.nonce : currentNonce;
      
      // Determine transaction type
      const txType = config?.type !== undefined ? config.type : 
                     (this.config.feeConfig?.type === 'eip1559' ? 2 : 0);

      // Prepare base transaction
      const txRequest: ethers.providers.TransactionRequest = {
        to,
        value: config?.value?.toString() || amount.toString(),
        data: config?.data || '0x', // Contract call data or empty
        nonce,
        chainId: config?.chainId || (this.config.chainId as number),
        type: txType,
      };

      // Apply fee configuration based on transaction type
      if (txType === 2 || config?.maxFeePerGas || config?.maxPriorityFeePerGas) {
        // EIP-1559 transaction
        const feeData = await this.provider.getFeeData();
        txRequest.maxFeePerGas = config?.maxFeePerGas?.toString() || 
                                feeData.maxFeePerGas?.toString() || 
                                gasPrice.toString();
        txRequest.maxPriorityFeePerGas = config?.maxPriorityFeePerGas?.toString() || 
                                        feeData.maxPriorityFeePerGas?.toString() || 
                                        '2000000000'; // 2 gwei default tip
      } else {
        // Legacy transaction
        txRequest.gasPrice = config?.gasPrice?.toString() || gasPrice.toString();
      }

      // Set gas limit (allow override or estimate)
      if (config?.gasLimit) {
        txRequest.gasLimit = config.gasLimit.toString();
      } else {
        try {
          const estimatedGas = await this.provider.estimateGas(txRequest);
          txRequest.gasLimit = estimatedGas.toString();
        } catch (error) {
          // Fallback to default gas limit
          txRequest.gasLimit = txRequest.data && txRequest.data !== '0x' ? '100000' : '21000';
        }
      }

      // Sign and send transaction
      const tx = await wallet.sendTransaction(txRequest);
      
      this.logger?.info('EVM transaction sent', {
        chain: this.chainName,
        from,
        to,
        amount: amount.toString(),
        txHash: tx.hash,
        gasPrice: txRequest.gasPrice || txRequest.maxFeePerGas,
        nonce
      });

      return {
        txHash: tx.hash,
        blockNumber: tx.blockNumber || undefined,
        status: 'pending',
        fee: new Big(txRequest.gasLimit?.toString() || '21000').times(txRequest.gasPrice?.toString() || txRequest.maxFeePerGas?.toString() || '0')
      };
    } catch (error) {
      this.logger?.error('Failed to send EVM transaction', error as Error, {
        chain: this.chainName,
        from,
        to,
        amount: amount.toString()
      });
      throw error;
    }
  }

  protected async getIncomingTransactions(address: string, seen: Set<string>): Promise<IncomingTransaction[]> {
    try {
      // Get latest block
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 100); // Check last 100 blocks
      
      // Get transfer events (this is a simplified version)
      // In practice, you'd want to use the explorer API or event filtering
      const incoming: IncomingTransaction[] = [];
      
      for (let blockNumber = fromBlock; blockNumber <= latestBlock; blockNumber++) {
        const block = await this.provider.getBlockWithTransactions(blockNumber);
        
        for (const tx of block.transactions) {
          if (seen.has(tx.hash)) continue;
          
          if (tx.to === address && tx.value.gt(0)) {
            incoming.push({
              txHash: tx.hash,
              from: tx.from,
              to: address,
              amount: new Big(tx.value.toString()),
              blockNumber,
              timestamp: block.timestamp * 1000
            });
          }
        }
      }
      
      return incoming;
    } catch (error) {
      this.logger?.error('Failed to get incoming EVM transactions', error as Error, {
        chain: this.chainName,
        address
      });
      return [];
    }
  }

  // Enhanced methods

  async estimateFee(params: any, to: string, amount: Big): Promise<FeeEstimate> {
    try {
      const address = await this.deriveAddress(params);
      
      // Estimate gas for the transaction
      const gasLimit = await this.provider.estimateGas({
        from: address,
        to,
        value: amount.toString()
      });

      let baseFee: Big;
      let priorityFee: Big;
      let totalFee: Big;

      if (this.config.feeConfig?.type === 'eip1559') {
        // EIP-1559 fee estimation
        const feeData = await this.provider.getFeeData();
        baseFee = new Big(feeData.maxFeePerGas?.toString() || '0');
        priorityFee = new Big(feeData.maxPriorityFeePerGas?.toString() || '0');
        totalFee = new Big(gasLimit.toString()).times(baseFee);
      } else {
        // Legacy fee estimation
        const gasPrice = await this.provider.getGasPrice();
        baseFee = new Big(gasPrice.toString());
        priorityFee = new Big(0);
        totalFee = new Big(gasLimit.toString()).times(baseFee);
      }

      return {
        baseFee,
        priorityFee,
        totalFee,
        gasLimit: new Big(gasLimit.toString()),
        gasPrice: baseFee
      };
    } catch (error) {
      this.logger?.error('Failed to estimate EVM fee', error as Error, {
        chain: this.chainName,
        to,
        amount: amount.toString()
      });
      throw error;
    }
  }

  async getHistory(params: any, limit = 100): Promise<TransactionHistory[]> {
    try {
      const address = await this.deriveAddress(params);
      
      // This would typically use an explorer API
      // For now, implement a basic version using provider
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 1000); // Check last 1000 blocks
      
      const history: TransactionHistory[] = [];
      
      for (let blockNumber = latestBlock; blockNumber >= fromBlock && history.length < limit; blockNumber--) {
        try {
          const block = await this.provider.getBlockWithTransactions(blockNumber);
          
          for (const tx of block.transactions) {
            if (history.length >= limit) break;
            
            if (tx.from === address || tx.to === address) {
              const receipt = await this.provider.getTransactionReceipt(tx.hash);
              
              history.push({
                txHash: tx.hash,
                blockNumber,
                timestamp: block.timestamp * 1000,
                from: tx.from,
                to: tx.to || '',
                amount: new Big(tx.value.toString()),
                fee: new Big(receipt.gasUsed.toString()).times(receipt.effectiveGasPrice?.toString() || tx.gasPrice?.toString() || '0'),
                status: receipt.status === 1 ? 'confirmed' : 'failed',
                direction: tx.from === address ? 'outgoing' : 'incoming'
              });
            }
          }
        } catch (blockError) {
          // Skip blocks that can't be fetched
          continue;
        }
      }
      
      return history.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      this.logger?.error('Failed to get EVM transaction history', error as Error, {
        chain: this.chainName,
        limit
      });
      throw error;
    }
  }

  // ERC20 Token support

  async getTokenBalance(params: any, tokenContract: string, decimals: number): Promise<Big> {
    try {
      const address = await this.deriveAddress(params);
      
      // ERC20 balanceOf function signature
      const data = '0x70a08231' + address.slice(2).padStart(64, '0');
      
      const result = await this.provider.call({
        to: tokenContract,
        data
      });
      
      const balance = ethers.BigNumber.from(result);
      return new Big(balance.toString()).div(Math.pow(10, decimals));
    } catch (error) {
      this.logger?.error('Failed to get ERC20 token balance', error as Error, {
        chain: this.chainName,
        tokenContract,
        decimals
      });
      throw error;
    }
  }

  async sendToken(
    params: any,
    tokenContract: string,
    to: string,
    amount: Big,
    decimals: number
  ): Promise<TransactionResponse> {
    try {
      const privateKey = this.derivePrivateKey(params);
      const from = await this.deriveAddress(params);
      
      // Validate addresses
      this.validateEvmAddress(to);
      this.validateEvmAddress(tokenContract);
      
      // Create wallet
      const wallet = new ethers.Wallet(
        '0x' + Buffer.from(privateKey).toString('hex'),
        this.provider
      );

      // Create ERC20 contract interface
      const contract = new ethers.Contract(
        tokenContract,
        ['function transfer(address to, uint256 amount) returns (bool)'],
        wallet
      );

      // Convert amount to token units
      const tokenAmount = amount.times(Math.pow(10, decimals));

      // Send token transfer transaction
      const tx = await contract.transfer(to, tokenAmount.toString());
      
      this.logger?.info('ERC20 token transfer sent', {
        chain: this.chainName,
        from,
        to,
        tokenContract,
        amount: amount.toString(),
        txHash: tx.hash
      });

      return {
        txHash: tx.hash,
        status: 'pending'
      };
    } catch (error) {
      this.logger?.error('Failed to send ERC20 token', error as Error, {
        chain: this.chainName,
        tokenContract,
        to,
        amount: amount.toString()
      });
      throw error;
    }
  }

  // Helper methods

  private validateEvmAddress(address: string): void {
    if (!ethers.utils.isAddress(address)) {
      throw new Error(`Invalid EVM address format: ${address}`);
    }
  }

  private async getOptimalGasPrice(): Promise<Big> {
    try {
      if (this.config.feeConfig?.type === 'eip1559') {
        const feeData = await this.provider.getFeeData();
        return new Big(feeData.gasPrice?.toString() || '0');
      } else {
        const gasPrice = await this.provider.getGasPrice();
        return new Big(gasPrice.toString());
      }
    } catch (error) {
      this.logger?.warn('Failed to get optimal gas price, using fallback', { error });
      return new Big('20000000000'); // 20 gwei fallback
    }
  }

  // Lifecycle methods

  async initialize(): Promise<void> {
    await super.initialize();
    
    // Test provider connection
    try {
      await this.provider.getNetwork();
      this.logger?.info('EVM provider connected', { chain: this.chainName });
    } catch (error) {
      this.logger?.error('Failed to connect to EVM provider', error as Error, { 
        chain: this.chainName 
      });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Close WebSocket connections
    if (this.wsProvider) {
      this.wsProvider.removeAllListeners();
      await this.wsProvider.destroy();
    }
    
    await super.shutdown();
  }

  // Override base validation
  protected validateAddress(address: string): void {
    this.validateEvmAddress(address);
  }
}

// Factory function to create EVM adapters for different chains
export function createEvmAdapter(
  chain: SupportedChain,
  config: ChainConfig,
  masterSeed: Uint8Array,
  adapterConfig?: AdapterConfig,
  logger?: Logger,
  metrics?: MetricsCollector
): EvmAdapterV2 {
  return new EvmAdapterV2(chain, config, masterSeed, adapterConfig, logger, metrics);
}