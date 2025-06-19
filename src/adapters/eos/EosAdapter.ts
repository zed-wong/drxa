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
import { Api, JsonRpc, RpcError } from 'eosjs';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig.js';
import { PrivateKey, PublicKey } from 'eosjs/dist/eosjs-key-conversions.js';

/**
 * EOS adapter with complete functionality
 * Supports EOS transfers, balance checking, and transaction monitoring
 */
export class EosAdapter extends BaseAdapter {
  readonly chainName: SupportedChain = 'eos';
  readonly config: ChainConfig = {
    name: 'EOS',
    symbol: 'EOS',
    decimals: 4,
    category: 'other',
    endpoints: {
      http: {
        url: 'https://eos.greymass.com',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://eospark.com',
      apiUrl: 'https://eos.greymass.com'
    }
  };

  private rpc: JsonRpc;
  private api: Api;

  constructor(
    masterSeed: Uint8Array,
    adapterConfig: AdapterConfig = {},
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    super(masterSeed, adapterConfig, logger, metrics);
    
    // Initialize EOS RPC
    this.rpc = new JsonRpc(this.config.endpoints.http.url, { 
      fetch: fetch as any // Type compatibility
    });

    // Initialize API (will be updated when we have keys)
    this.api = new Api({
      rpc: this.rpc,
      signatureProvider: new JsSignatureProvider([]), // Empty for now
      textDecoder: new TextDecoder(),
      textEncoder: new TextEncoder(),
    });
  }

  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    try {
      // Convert private key to EOS format
      const privateKeyString = this.uint8ArrayToEosPrivateKey(privateKey);
      const eosPrivateKey = PrivateKey.fromString(privateKeyString);
      const publicKey = eosPrivateKey.getPublicKey();
      
      // Generate EOS account name from public key
      // Note: In EOS, addresses are human-readable account names
      // This is a simplified approach - in practice, account creation is more complex
      const accountName = this.publicKeyToAccountName(publicKey.toString());
      
      return accountName;
    } catch (error) {
      this.logger?.error('Failed to derive EOS address', error as Error, { 
        privateKeyLength: privateKey.length 
      });
      throw error;
    }
  }

  protected async getBalanceForAddress(address: string): Promise<Big> {
    try {
      // Get account balance
      const result = await this.rpc.get_currency_balance('eosio.token', address, 'EOS');
      
      if (result.length === 0) {
        return new Big(0);
      }
      
      // Parse balance (format: "1.0000 EOS")
      const balanceString = result[0].split(' ')[0];
      return new Big(balanceString).times(Math.pow(10, this.config.decimals));
    } catch (error) {
      this.logger?.error('Failed to get EOS balance', error as Error, { address });
      // If account doesn't exist, return 0
      if (error instanceof RpcError && error.details[0]?.message?.includes('unknown key')) {
        return new Big(0);
      }
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
      // Validate EOS account names
      this.validateEosAccountName(from);
      this.validateEosAccountName(to);
      
      // Convert private key
      const privateKeyString = this.uint8ArrayToEosPrivateKey(privateKey);
      
      // Create signature provider with the private key
      const signatureProvider = new JsSignatureProvider([privateKeyString]);
      
      // Create API instance with signature provider
      const api = new Api({
        rpc: this.rpc,
        signatureProvider,
        textDecoder: new TextDecoder(),
        textEncoder: new TextEncoder(),
      });

      // Convert amount to EOS format (4 decimal places)
      const eosAmount = amount.div(Math.pow(10, this.config.decimals)).toFixed(4) + ' EOS';

      // Create transfer action
      const action = {
        account: 'eosio.token',
        name: 'transfer',
        authorization: [{
          actor: from,
          permission: 'active'
        }],
        data: {
          from,
          to,
          quantity: eosAmount,
          memo: config?.data || ''
        }
      };

      // Send transaction
      const result = await api.transact(
        { actions: [action] },
        {
          blocksBehind: 3,
          expireSeconds: 30,
        }
      );

      this.logger?.info('EOS transaction sent', {
        from,
        to,
        amount: amount.toString(),
        txHash: result.transaction_id
      });

      return {
        txHash: result.transaction_id,
        blockNumber: result.processed?.block_num,
        status: 'confirmed' // EOS transactions are immediately confirmed
      };
    } catch (error) {
      this.logger?.error('Failed to send EOS transaction', error as Error, {
        from,
        to,
        amount: amount.toString()
      });
      throw error;
    }
  }

  protected async getIncomingTransactions(address: string, seen: Set<string>): Promise<IncomingTransaction[]> {
    try {
      // Get account actions (transactions)
      const result = await this.rpc.get_actions(address, -1, -20); // Last 20 actions
      const incoming: IncomingTransaction[] = [];

      for (const action of result.actions) {
        const txHash = action.action_trace.trx_id;
        if (seen.has(txHash)) continue;

        const trace = action.action_trace;
        
        // Check if this is a token transfer to our address
        if (trace.act.account === 'eosio.token' && 
            trace.act.name === 'transfer' &&
            trace.act.data.to === address) {
          
          // Parse amount
          const quantityString = trace.act.data.quantity;
          const amountParts = quantityString.split(' ');
          const amount = new Big(amountParts[0]).times(Math.pow(10, this.config.decimals));

          incoming.push({
            txHash,
            from: trace.act.data.from,
            to: address,
            amount,
            blockNumber: action.block_num,
            timestamp: new Date(action.block_time + 'Z').getTime()
          });
        }
      }

      return incoming;
    } catch (error) {
      this.logger?.error('Failed to get incoming EOS transactions', error as Error, { address });
      return [];
    }
  }

  // Enhanced methods

  async estimateFee(params: any, to: string, amount: Big): Promise<FeeEstimate> {
    try {
      // EOS has very low, predictable fees
      // CPU and NET are the main resources, but they're usually delegated
      const cpuFee = new Big('100'); // Minimal CPU fee
      const netFee = new Big('100'); // Minimal NET fee
      const totalFee = cpuFee.plus(netFee);

      return {
        baseFee: totalFee,
        totalFee,
        gasLimit: new Big('1000'), // CPU microseconds
        gasPrice: new Big('1') // Not applicable to EOS
      };
    } catch (error) {
      this.logger?.error('Failed to estimate EOS fee', error as Error, {
        to,
        amount: amount.toString()
      });
      throw error;
    }
  }

  async getHistory(params: any, limit = 100): Promise<TransactionHistory[]> {
    try {
      const address = await this.deriveAddress(params);
      const result = await this.rpc.get_actions(address, -1, -limit);
      const history: TransactionHistory[] = [];

      for (const action of result.actions) {
        const trace = action.action_trace;
        
        // Process token transfers
        if (trace.act.account === 'eosio.token' && trace.act.name === 'transfer') {
          const data = trace.act.data;
          const quantityString = data.quantity;
          const amountParts = quantityString.split(' ');
          const amount = new Big(amountParts[0]).times(Math.pow(10, this.config.decimals));
          
          history.push({
            txHash: trace.trx_id,
            blockNumber: action.block_num,
            timestamp: new Date(action.block_time + 'Z').getTime(),
            from: data.from,
            to: data.to,
            amount,
            fee: new Big('200'), // Estimate
            status: 'confirmed',
            direction: data.from === address ? 'outgoing' : 'incoming'
          });
        }
      }

      return history.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      this.logger?.error('Failed to get EOS transaction history', error as Error, { limit });
      throw error;
    }
  }

  // Helper methods

  private validateEosAccountName(accountName: string): void {
    // EOS account names are 1-12 characters, lowercase a-z and 1-5
    const eosAccountRegex = /^[a-z1-5]{1,12}$/;
    if (!eosAccountRegex.test(accountName)) {
      throw new Error(`Invalid EOS account name: ${accountName}`);
    }
  }

  private uint8ArrayToEosPrivateKey(privateKey: Uint8Array): string {
    // Convert to WIF format for EOS
    // This is a simplified approach - use proper key conversion in production
    const privateKeyHex = Array.from(privateKey)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    
    return '5' + privateKeyHex; // Simplified WIF format
  }

  private publicKeyToAccountName(publicKeyString: string): string {
    // Generate a deterministic account name from public key
    // This is simplified - in practice, EOS accounts are created through a more complex process
    let hash = 0;
    for (let i = 0; i < publicKeyString.length; i++) {
      const char = publicKeyString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Convert to EOS account name format (a-z, 1-5)
    const chars = 'abcdefghijklmnopqrstuvwxyz12345';
    let accountName = '';
    let absHash = Math.abs(hash);
    
    for (let i = 0; i < 12; i++) {
      accountName += chars[absHash % chars.length];
      absHash = Math.floor(absHash / chars.length);
    }

    return accountName;
  }

  // Lifecycle methods

  async initialize(): Promise<void> {
    await super.initialize();
    
    try {
      // Test connection by getting chain info
      await this.rpc.get_info();
      this.logger?.info('EOS RPC connected successfully');
    } catch (error) {
      this.logger?.error('Failed to connect to EOS network', error as Error);
      throw error;
    }
  }

  // Override base validation
  protected validateAddress(address: string): void {
    this.validateEosAccountName(address);
  }
}