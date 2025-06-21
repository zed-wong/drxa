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
  EvmTransactionConfig,
  DeriveParams,
  TransactionConfig,
  SubscriptionCallback,
  Unsubscribe
} from "../../types/index.js";
import Big from "big.js";
import { ethers } from "ethers";
import * as secp256k1 from "@noble/secp256k1";
import { keccak256 } from "js-sha3";
import { ConnectionPool, ConnectionFactory } from "../../core/pool/ConnectionPool.js";
import { ValidationError, ErrorCode } from "../../core/errors/index.js";

/**
 * Enhanced EVM adapter supporting multiple EVM-compatible chains
 * with improved error handling, type safety, and resource management
 */
export class EvmAdapterV2 extends BaseAdapter {
  readonly chainName: SupportedChain;
  readonly config: ChainConfig;
  
  private provider: ethers.providers.JsonRpcProvider;
  private wsProvider?: ethers.providers.WebSocketProvider;
  private providerPool?: ConnectionPool<ethers.providers.JsonRpcProvider>;

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

    // Initialize connection pool for parallel requests
    const providerFactory: ConnectionFactory<ethers.providers.JsonRpcProvider> = {
      create: async () => {
        const provider = new ethers.providers.JsonRpcProvider(
          httpEndpoint.url,
          { 
            chainId: config.chainId as number,
            name: config.name 
          }
        );
        
        // Test the connection
        await provider.getNetwork();
        return provider;
      },
      
      destroy: async (provider) => {
        // Ethers providers don't need explicit cleanup
        provider.removeAllListeners();
      },
      
      validate: async (provider) => {
        try {
          await provider.getBlockNumber();
          return true;
        } catch {
          return false;
        }
      }
    };

    this.providerPool = new ConnectionPool(
      providerFactory,
      {
        maxSize: 10,
        minSize: 2,
        acquireTimeoutMs: 5000,
        validateOnBorrow: true
      },
      this.logger
    );
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

  async getHistory(params: any, limit = 100, options?: { 
    fromBlock?: number; 
    toBlock?: number; 
    pageSize?: number;
    includeTokenTransfers?: boolean;
  }): Promise<TransactionHistory[]> {
    try {
      const address = await this.deriveAddress(params);
      
      // Determine block range
      const latestBlock = options?.toBlock || await this.provider.getBlockNumber();
      const defaultFromBlock = Math.max(0, latestBlock - 10000); // Default: check last 10k blocks
      const fromBlock = options?.fromBlock || defaultFromBlock;
      
      // Pagination settings
      const pageSize = options?.pageSize || 1000; // Process blocks in chunks
      const history: TransactionHistory[] = [];
      
      // Process blocks in reverse order (newest first) with pagination
      for (let endBlock = latestBlock; endBlock >= fromBlock && history.length < limit; endBlock -= pageSize) {
        const startBlock = Math.max(fromBlock, endBlock - pageSize + 1);
        
        // Fetch logs for the address in this block range
        try {
          // Get incoming ETH transfers using logs (more efficient than checking every block)
          const ethTransferLogs = await this.provider.getLogs({
            fromBlock: startBlock,
            toBlock: endBlock,
            topics: [
              null,
              null,
              ethers.utils.hexZeroPad(address, 32) // to address
            ]
          });
          
          // Get outgoing transactions
          const outgoingFilter = {
            fromBlock: startBlock,
            toBlock: endBlock,
            topics: [
              null,
              ethers.utils.hexZeroPad(address, 32), // from address
              null
            ]
          };
          
          // Process ETH transfers by scanning blocks (since ETH transfers don't emit logs)
          const blockPromises: Promise<void>[] = [];
          
          // Batch process blocks for better performance using connection pool
          const batchSize = 10;
          for (let blockNum = endBlock; blockNum >= startBlock; blockNum -= batchSize) {
            const batchPromise = (async () => {
              const batchStart = Math.max(startBlock, blockNum - batchSize + 1);
              
              // Use pooled providers for parallel block fetching
              const blocks = await Promise.all(
                Array.from({ length: blockNum - batchStart + 1 }, (_, i) => 
                  this.withPooledProvider(async (provider) => {
                    try {
                      return await provider.getBlockWithTransactions(batchStart + i);
                    } catch {
                      return null;
                    }
                  })
                )
              );
              
              for (const block of blocks) {
                if (!block) continue;
                
                for (const tx of block.transactions) {
                  if (history.length >= limit) return;
                  
                  // Check if transaction involves our address
                  if (tx.from === address || tx.to === address) {
                    try {
                      const receipt = await this.withPooledProvider(provider => 
                        provider.getTransactionReceipt(tx.hash)
                      );
                      
                      history.push({
                        txHash: tx.hash,
                        blockNumber: block.number,
                        timestamp: block.timestamp * 1000,
                        from: tx.from,
                        to: tx.to || '',
                        amount: new Big(tx.value.toString()),
                        fee: new Big(receipt.gasUsed.toString()).times(
                          receipt.effectiveGasPrice?.toString() || tx.gasPrice?.toString() || '0'
                        ),
                        status: receipt.status === 1 ? 'confirmed' : 'failed',
                        direction: tx.from === address ? 'outgoing' : 'incoming',
                        data: tx.data
                      });
                    } catch (err) {
                      this.logger?.warn('Failed to get receipt for transaction', { 
                        txHash: tx.hash, 
                        error: err 
                      });
                    }
                  }
                }
              }
            })();
            
            blockPromises.push(batchPromise);
          }
          
          // Wait for all block processing to complete
          await Promise.all(blockPromises);
          
          // Also get ERC20 token transfers if requested
          if (options?.includeTokenTransfers) {
            const transferEventSignature = ethers.utils.id('Transfer(address,address,uint256)');
            
            // Incoming token transfers
            const incomingTokenLogs = await this.provider.getLogs({
              fromBlock: startBlock,
              toBlock: endBlock,
              topics: [
                transferEventSignature,
                null, // from (any)
                ethers.utils.hexZeroPad(address, 32) // to (our address)
              ]
            });
            
            // Outgoing token transfers
            const outgoingTokenLogs = await this.provider.getLogs({
              fromBlock: startBlock,
              toBlock: endBlock,
              topics: [
                transferEventSignature,
                ethers.utils.hexZeroPad(address, 32), // from (our address)
                null // to (any)
              ]
            });
            
            // Process token transfer logs
            const allTokenLogs = [...incomingTokenLogs, ...outgoingTokenLogs];
            
            for (const log of allTokenLogs) {
              if (history.length >= limit) break;
              
              try {
                const tx = await this.provider.getTransaction(log.transactionHash);
                const receipt = await this.provider.getTransactionReceipt(log.transactionHash);
                const block = await this.provider.getBlock(log.blockNumber);
                
                // Decode transfer amount
                const amount = ethers.BigNumber.from(log.data);
                const from = ethers.utils.getAddress('0x' + log.topics[1].slice(26));
                const to = ethers.utils.getAddress('0x' + log.topics[2].slice(26));
                
                history.push({
                  txHash: log.transactionHash,
                  blockNumber: log.blockNumber,
                  timestamp: block.timestamp * 1000,
                  from: from,
                  to: to,
                  amount: new Big(amount.toString()),
                  fee: new Big(receipt.gasUsed.toString()).times(
                    receipt.effectiveGasPrice?.toString() || tx.gasPrice?.toString() || '0'
                  ),
                  status: receipt.status === 1 ? 'confirmed' : 'failed',
                  direction: from.toLowerCase() === address.toLowerCase() ? 'outgoing' : 'incoming',
                  tokenContract: log.address,
                  logIndex: log.logIndex
                });
              } catch (err) {
                this.logger?.warn('Failed to process token transfer log', { 
                  txHash: log.transactionHash, 
                  error: err 
                });
              }
            }
          }
          
        } catch (error) {
          this.logger?.warn('Failed to fetch logs for block range', { 
            startBlock, 
            endBlock, 
            error 
          });
        }
      }
      
      // Remove duplicates and sort by timestamp (newest first)
      const uniqueHistory = Array.from(
        new Map(history.map(tx => [tx.txHash, tx])).values()
      );
      
      return uniqueHistory
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      this.logger?.error('Failed to get EVM transaction history', error as Error, {
        chain: this.chainName,
        limit,
        options
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
    
    // Destroy provider pool
    if (this.providerPool) {
      await this.providerPool.destroy();
    }
    
    await super.shutdown();
  }

  // Helper method to execute operations with pooled providers
  private async withPooledProvider<T>(
    operation: (provider: ethers.providers.JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    if (!this.providerPool) {
      // Fallback to main provider if pool not available
      return operation(this.provider);
    }

    const connection = await this.providerPool.acquire();
    try {
      return await operation(connection.resource);
    } finally {
      await this.providerPool.release(connection);
    }
  }

  // Override base validation
  protected validateAddress(address: string): void {
    this.validateEvmAddress(address);
  }

  // Implement subscribe method for real-time transaction monitoring
  async subscribe(address: string, callback: SubscriptionCallback): Promise<Unsubscribe> {
    this.validateAddress(address);
    
    // Use WebSocket provider if available for real-time updates
    if (this.wsProvider) {
      // Subscribe to incoming transactions
      const filter = {
        address: address,
        topics: []
      };
      
      // For incoming ETH transfers
      this.wsProvider.on('block', async (blockNumber) => {
        try {
          const block = await this.wsProvider!.getBlockWithTransactions(blockNumber);
          
          for (const tx of block.transactions) {
            // Check if transaction is TO the address
            if (tx.to === address && tx.value.gt(0)) {
              const receipt = await this.wsProvider!.getTransactionReceipt(tx.hash);
              
              if (receipt && receipt.status === 1) {
                const incomingTx: IncomingTransaction = {
                  txHash: tx.hash,
                  from: tx.from,
                  to: address,
                  amount: new Big(tx.value.toString()),
                  blockNumber: blockNumber,
                  timestamp: block.timestamp * 1000
                };
                
                await callback(incomingTx);
              }
            }
          }
        } catch (error) {
          this.logger?.error('Error processing block for subscription', error as Error, {
            chain: this.chainName,
            address,
            blockNumber
          });
        }
      });
      
      // Also listen for ERC20 Transfer events TO the address
      const transferEventSignature = ethers.utils.id('Transfer(address,address,uint256)');
      const addressPadded = ethers.utils.hexZeroPad(address, 32);
      
      const erc20Filter = {
        topics: [
          transferEventSignature,
          null, // from (any)
          addressPadded // to (our address)
        ]
      };
      
      this.wsProvider.on(erc20Filter, async (log) => {
        try {
          // Decode the transfer event
          const amount = ethers.BigNumber.from(log.data);
          const from = ethers.utils.hexStripZeros(log.topics[1]);
          
          const incomingTx: IncomingTransaction = {
            txHash: log.transactionHash,
            from: from,
            to: address,
            amount: new Big(amount.toString()),
            blockNumber: log.blockNumber,
            timestamp: Date.now(), // Will be updated with actual block timestamp
            tokenContract: log.address
          };
          
          // Get actual timestamp
          const block = await this.wsProvider!.getBlock(log.blockNumber);
          incomingTx.timestamp = block.timestamp * 1000;
          
          await callback(incomingTx);
        } catch (error) {
          this.logger?.error('Error processing ERC20 transfer event', error as Error, {
            chain: this.chainName,
            address,
            log
          });
        }
      });
      
      // Return unsubscribe function
      return () => {
        this.wsProvider?.removeAllListeners('block');
        this.wsProvider?.removeAllListeners(erc20Filter);
      };
    } else {
      // Fallback to polling if no WebSocket available
      return super.subscribe(address, callback);
    }
  }

  // Implement sign method for offline transaction signing
  async sign(params: DeriveParams, tx: TransactionConfig): Promise<string> {
    try {
      const privateKey = this.derivePrivateKey(params);
      const address = await this.deriveAddress(params);
      
      // Create wallet from private key
      const wallet = new ethers.Wallet(
        '0x' + Buffer.from(privateKey).toString('hex')
      );
      
      // Cast to EVM transaction config
      const evmTx = tx as EvmTransactionConfig;
      
      // Validate required fields
      if (!evmTx.to) {
        throw new ValidationError(ErrorCode.INVALID_PARAMS, 'Transaction must have a "to" address');
      }
      
      this.validateEvmAddress(evmTx.to);
      
      // Get nonce if not provided
      const nonce = evmTx.nonce !== undefined ? evmTx.nonce : 
                    await this.provider.getTransactionCount(address, 'pending');
      
      // Determine transaction type
      const txType = evmTx.type !== undefined ? evmTx.type : 
                     (this.config.feeConfig?.type === 'eip1559' ? 2 : 0);
      
      // Prepare transaction request
      const txRequest: ethers.providers.TransactionRequest = {
        to: evmTx.to,
        value: evmTx.value?.toString() || '0',
        data: evmTx.data || '0x',
        nonce,
        chainId: evmTx.chainId || (this.config.chainId as number),
        type: txType,
      };
      
      // Set gas parameters based on transaction type
      if (txType === 2 || evmTx.maxFeePerGas || evmTx.maxPriorityFeePerGas) {
        // EIP-1559 transaction
        if (!evmTx.maxFeePerGas || !evmTx.maxPriorityFeePerGas) {
          const feeData = await this.provider.getFeeData();
          txRequest.maxFeePerGas = evmTx.maxFeePerGas?.toString() || 
                                  feeData.maxFeePerGas?.toString();
          txRequest.maxPriorityFeePerGas = evmTx.maxPriorityFeePerGas?.toString() || 
                                          feeData.maxPriorityFeePerGas?.toString();
        } else {
          txRequest.maxFeePerGas = evmTx.maxFeePerGas.toString();
          txRequest.maxPriorityFeePerGas = evmTx.maxPriorityFeePerGas.toString();
        }
      } else {
        // Legacy transaction
        const gasPrice = evmTx.gasPrice || await this.provider.getGasPrice();
        txRequest.gasPrice = gasPrice.toString();
      }
      
      // Set gas limit
      if (evmTx.gasLimit) {
        txRequest.gasLimit = evmTx.gasLimit.toString();
      } else {
        try {
          const estimatedGas = await this.provider.estimateGas(txRequest);
          txRequest.gasLimit = estimatedGas.toString();
        } catch (error) {
          // Use default gas limits
          txRequest.gasLimit = txRequest.data && txRequest.data !== '0x' ? '100000' : '21000';
        }
      }
      
      // Sign the transaction
      const signedTx = await wallet.signTransaction(txRequest);
      
      this.logger?.info('Transaction signed', {
        chain: this.chainName,
        from: address,
        to: evmTx.to,
        nonce,
        type: txType
      });
      
      return signedTx;
    } catch (error) {
      this.logger?.error('Failed to sign transaction', error as Error, {
        chain: this.chainName,
        params
      });
      throw error;
    }
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