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
  IncomingTransaction
} from "../../types/index.js";
import Big from "big.js";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
  AccountAddress,
} from "@aptos-labs/ts-sdk";

/**
 * Enhanced Aptos adapter with fixed balance method and complete functionality
 */
export class AptosAdapterV2 extends BaseAdapter {
  readonly chainName: SupportedChain = 'aptos';
  readonly config: ChainConfig = {
    name: 'Aptos',
    symbol: 'APT',
    decimals: 8,
    category: 'other',
    endpoints: {
      http: {
        url: 'https://api.mainnet.aptoslabs.com/v1',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://explorer.aptoslabs.com',
      apiUrl: 'https://api.mainnet.aptoslabs.com/v1'
    }
  };

  private sdk: Aptos;

  constructor(
    masterSeed: Uint8Array,
    adapterConfig: AdapterConfig = {},
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    super(masterSeed, adapterConfig, logger, metrics);
    
    // Initialize Aptos SDK
    const aptosConfig = new AptosConfig({
      network: Network.MAINNET,
      fullnode: Array.isArray(this.config.endpoints.http) ? this.config.endpoints.http[0].url : this.config.endpoints.http.url,
    });
    
    this.sdk = new Aptos(aptosConfig);
  }

  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    try {
      const ed25519PrivateKey = new Ed25519PrivateKey(privateKey);
      const account = Account.fromPrivateKey({ privateKey: ed25519PrivateKey });
      return account.accountAddress.toString();
    } catch (error) {
      this.logger?.error('Failed to derive Aptos address', error as Error, { 
        privateKeyLength: privateKey.length 
      });
      throw error;
    }
  }

  protected async getBalanceForAddress(address: string): Promise<Big> {
    try {
      // Fixed balance method using the correct API
      const accountAddress = AccountAddress.fromString(address);
      
      // Get account resource for the APT coin
      const aptCoinType = "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>";
      
      try {
        const resource = await this.sdk.getAccountResource({
          accountAddress,
          resourceType: aptCoinType
        });
        
        // Extract balance from the coin store
        const coinStore = resource as any;
        const balance = coinStore.coin.value;
        
        return new Big(balance);
      } catch (resourceError: any) {
        // If the resource doesn't exist, the account has 0 balance
        if (resourceError.status === 404 || resourceError.message?.includes('Resource not found')) {
          return new Big(0);
        }
        throw resourceError;
      }
    } catch (error) {
      this.logger?.error('Failed to get Aptos balance', error as Error, { address });
      throw error;
    }
  }

  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: TransactionRequest
  ): Promise<TransactionResponse> {
    try {
      // Validate Aptos addresses
      this.validateAptosAddress(to);
      
      // Create account from private key
      const ed25519PrivateKey = new Ed25519PrivateKey(privateKey);
      const account = Account.fromPrivateKey({ privateKey: ed25519PrivateKey });
      
      // Build transaction
      const transaction = await this.sdk.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: "0x1::coin::transfer",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [to, amount.toString()],
        },
      });

      // Sign and submit transaction
      const senderAuthenticator = this.sdk.transaction.sign({
        signer: account,
        transaction,
      });

      const response = await this.sdk.transaction.submit.simple({
        transaction,
        senderAuthenticator,
      });

      this.logger?.info('Aptos transaction sent', {
        from,
        to,
        amount: amount.toString(),
        txHash: response.hash
      });

      return {
        txHash: response.hash,
        status: 'pending'
      };
    } catch (error) {
      this.logger?.error('Failed to send Aptos transaction', error as Error, {
        from,
        to,
        amount: amount.toString()
      });
      throw error;
    }
  }

  protected async getIncomingTransactions(address: string, seen: Set<string>): Promise<IncomingTransaction[]> {
    try {
      // Get account transactions
      const accountAddress = AccountAddress.fromString(address);
      const transactions = await this.sdk.getAccountTransactions({
        accountAddress,
        options: {
          limit: 25,
          // orderBy not supported in this SDK version
        }
      });

      const incoming: IncomingTransaction[] = [];

      for (const tx of transactions) {
        if (seen.has(tx.hash)) continue;

        // Check if this is a coin transfer to our address
        if (tx.type === 'user_transaction') {
          const userTx = tx as any;
          
          // Look for coin transfer events
          for (const event of userTx.events || []) {
            if (event.type === '0x1::coin::WithdrawEvent' || 
                event.type === '0x1::coin::DepositEvent') {
              
              if (event.type === '0x1::coin::DepositEvent') {
                incoming.push({
                  txHash: tx.hash,
                  from: 'unknown', // Would need to parse transaction payload
                  to: address,
                  amount: new Big(event.data.amount),
                  blockNumber: undefined, // Aptos uses version numbers
                  timestamp: new Date(tx.timestamp).getTime()
                });
              }
            }
          }
        }
      }

      return incoming;
    } catch (error) {
      this.logger?.error('Failed to get incoming Aptos transactions', error as Error, { address });
      return [];
    }
  }

  // Enhanced methods

  async estimateFee(params: any, to: string, amount: Big): Promise<FeeEstimate> {
    try {
      const address = await this.deriveAddress(params);
      const accountAddress = AccountAddress.fromString(address);
      const privateKey = this.derivePrivateKey(params);
      const ed25519PrivateKey = new Ed25519PrivateKey(privateKey);
      const account = Account.fromPrivateKey({ privateKey: ed25519PrivateKey });
      
      // Build a dummy transaction to estimate gas
      const transaction = await this.sdk.transaction.build.simple({
        sender: accountAddress,
        data: {
          function: "0x1::coin::transfer",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [to, amount.toString()],
        },
      });

      // Simulate transaction to get gas used
      const simulation = await this.sdk.transaction.simulate.simple({
        signerPublicKey: account.publicKey,
        transaction,
      });

      const gasUsed = new Big(simulation[0].gas_used);
      const gasUnitPrice = new Big(simulation[0].gas_unit_price);
      const totalFee = gasUsed.times(gasUnitPrice);

      return {
        baseFee: totalFee,
        totalFee,
        gasLimit: gasUsed,
        gasPrice: gasUnitPrice
      };
    } catch (error) {
      this.logger?.error('Failed to estimate Aptos fee', error as Error, {
        to,
        amount: amount.toString()
      });
      
      // Return fallback estimate
      return {
        baseFee: new Big('2000'), // ~0.00002 APT
        totalFee: new Big('2000'),
        gasLimit: new Big('2000'),
        gasPrice: new Big('1')
      };
    }
  }

  async getHistory(params: any, limit = 100): Promise<TransactionHistory[]> {
    try {
      const address = await this.deriveAddress(params);
      const accountAddress = AccountAddress.fromString(address);
      
      const transactions = await this.sdk.getAccountTransactions({
        accountAddress,
        options: {
          limit: Math.min(limit, 100),
          // orderBy not supported in this SDK version
        }
      });

      const history: TransactionHistory[] = [];

      for (const tx of transactions) {
        if (tx.type === 'user_transaction') {
          const userTx = tx as any;
          
          // Parse coin transfer events
          for (const event of userTx.events || []) {
            if (event.type === '0x1::coin::WithdrawEvent' || 
                event.type === '0x1::coin::DepositEvent') {
              
              history.push({
                txHash: tx.hash,
                blockNumber: 0, // Aptos uses versions
                timestamp: new Date(tx.timestamp).getTime(),
                from: event.type === '0x1::coin::WithdrawEvent' ? address : 'unknown',
                to: event.type === '0x1::coin::DepositEvent' ? address : 'unknown',
                amount: new Big(event.data.amount),
                fee: new Big(userTx.gas_used || '0').times(userTx.gas_unit_price || '1'),
                status: userTx.success ? 'confirmed' : 'failed',
                direction: event.type === '0x1::coin::WithdrawEvent' ? 'outgoing' : 'incoming'
              });
            }
          }
        }
      }

      return history.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      this.logger?.error('Failed to get Aptos transaction history', error as Error, { limit });
      throw error;
    }
  }

  // Aptos-specific methods

  async getAccountInfo(address: string): Promise<any> {
    try {
      const accountAddress = AccountAddress.fromString(address);
      return await this.sdk.getAccountInfo({ accountAddress });
    } catch (error) {
      this.logger?.error('Failed to get Aptos account info', error as Error, { address });
      throw error;
    }
  }

  async getAccountResources(address: string): Promise<any[]> {
    try {
      const accountAddress = AccountAddress.fromString(address);
      return await this.sdk.getAccountResources({ accountAddress });
    } catch (error) {
      this.logger?.error('Failed to get Aptos account resources', error as Error, { address });
      throw error;
    }
  }

  async callViewFunction(
    functionId: string,
    typeArguments: string[] = [],
    functionArguments: any[] = []
  ): Promise<any> {
    try {
      return await this.sdk.view({
        payload: {
          function: functionId as `${string}::${string}::${string}`,
          typeArguments,
          functionArguments,
        },
      });
    } catch (error) {
      this.logger?.error('Failed to call Aptos view function', error as Error, { 
        functionId 
      });
      throw error;
    }
  }

  // Helper methods

  private validateAptosAddress(address: string): void {
    try {
      AccountAddress.fromString(address);
    } catch (error) {
      throw new Error(`Invalid Aptos address format: ${address}`);
    }
  }

  // Lifecycle methods

  async initialize(): Promise<void> {
    await super.initialize();
    
    try {
      // Test connection by getting ledger info
      await this.sdk.getLedgerInfo();
      this.logger?.info('Aptos SDK connected successfully');
    } catch (error) {
      this.logger?.error('Failed to connect to Aptos network', error as Error);
      throw error;
    }
  }

  // Override base validation
  protected validateAddress(address: string): void {
    this.validateAptosAddress(address);
  }
}