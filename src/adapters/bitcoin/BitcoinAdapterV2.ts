import { BaseAdapter } from "../../core/adapters/BaseAdapter.js";
import { SupportedChain, ChainConfig, AdapterConfig, Logger, MetricsCollector, TransactionRequest, TransactionResponse, IncomingTransaction, BitcoinTransactionConfig } from "../../types/index.js";
import Big from "big.js";
import axios from "axios";
import { Buffer } from "buffer";
import * as tinysecp from "tiny-secp256k1";
import { initEccLib, payments, Psbt, networks } from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

// Initialize secp256k1 backend
initEccLib(tinysecp);

interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number };
}

interface Transaction {
  txid: string;
  status: { confirmed: boolean; block_height?: number };
  vin: Array<{ txid: string; vout: number; prevout: { scriptpubkey: string; value: number } }>;
  vout: Array<{ scriptpubkey: string; value: number }>;
}

/**
 * Enhanced Bitcoin adapter using the new BaseAdapter architecture
 * Supports Taproot (P2TR) addresses with improved error handling and resource management
 */
export class BitcoinAdapterV2 extends BaseAdapter {
  readonly chainName: SupportedChain = 'bitcoin';
  readonly config: ChainConfig = {
    chainId: 'bitcoin-mainnet',
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    category: 'utxo',
    endpoints: {
      http: {
        url: 'https://blockstream.info/api',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://blockstream.info',
      apiUrl: 'https://blockstream.info/api'
    },
    feeConfig: {
      type: 'dynamic'
    }
  };

  private readonly ECPair = ECPairFactory(tinysecp);

  constructor(
    masterSeed: Uint8Array,
    adapterConfig: AdapterConfig = {},
    logger?: Logger,
    metrics?: MetricsCollector
  ) {
    super(masterSeed, adapterConfig, logger, metrics);
  }

  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    try {
      const keyPair: ECPairInterface = this.ECPair.fromPrivateKey(
        Buffer.from(privateKey), 
        { compressed: true }
      );
      
      const internalPubkey = toXOnly(Buffer.from(keyPair.publicKey));
      const { address } = payments.p2tr({ 
        internalPubkey, 
        network: networks.bitcoin 
      });
      
      if (!address) {
        throw new Error("Failed to generate Taproot (P2TR) address");
      }
      
      return address;
    } catch (error) {
      this.logger?.error('Failed to derive Bitcoin address', error as Error, { privateKeyLength: privateKey.length });
      throw error;
    }
  }

  protected async getBalanceForAddress(address: string): Promise<Big> {
    try {
      const response = await axios.get(
        `${this.config.explorer!.apiUrl}/address/${address}`,
        { timeout: this.adapterConfig.timeout }
      );
      
      const data = response.data;
      const confirmedBalance = data.chain_stats?.funded_txo_sum || 0;
      const spentBalance = data.chain_stats?.spent_txo_sum || 0;
      const balance = confirmedBalance - spentBalance;
      
      this.logger?.debug('Bitcoin balance retrieved', { address, balance });
      return new Big(balance);
    } catch (error) {
      this.logger?.error('Failed to get Bitcoin balance', error as Error, { address });
      throw error;
    }
  }

  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: BitcoinTransactionConfig
  ): Promise<TransactionResponse> {
    try {
      // Validate Bitcoin address format
      this.validateBitcoinAddress(to);
      
      // Get UTXOs for the from address
      const utxos = await this.getUTXOs(from);
      if (utxos.length === 0) {
        throw new Error('No UTXOs available for transaction');
      }

      // Apply configuration for UTXO selection and fee calculation
      const feeRate = config?.feeRate || config?.satPerVByte || new Big(10); // Default 10 sat/vbyte
      const utxoSelection = config?.utxoSelection || 'auto';
      const specificUtxos = config?.specificUtxos;
      
      // Filter UTXOs if specific ones are requested
      let availableUtxos = utxos;
      if (specificUtxos && specificUtxos.length > 0) {
        availableUtxos = utxos.filter(utxo => specificUtxos.includes(utxo.txid));
        if (availableUtxos.length === 0) {
          throw new Error('None of the specified UTXOs are available');
        }
      }
      
      // Select UTXOs and calculate fee
      const { selectedUtxos, totalInput, fee } = await this.selectUTXOs(
        availableUtxos, 
        amount, 
        feeRate,
        utxoSelection
      );
      const totalOutput = amount.plus(fee);
      
      if (totalInput.lt(totalOutput)) {
        throw new Error(`Insufficient balance. Required: ${totalOutput.toString()}, Available: ${totalInput.toString()}`);
      }

      // Build and sign transaction
      const psbt = new Psbt({ network: networks.bitcoin });
      const keyPair = this.ECPair.fromPrivateKey(Buffer.from(privateKey), { compressed: true });
      const internalPubkey = toXOnly(Buffer.from(keyPair.publicKey));

      // Add inputs with optional RBF and sequence
      const sequence = config?.rbf ? 0xfffffffd : 0xffffffff; // Enable RBF if requested
      const lockTime = config?.lockTime || 0;
      
      for (const utxo of selectedUtxos) {
        const txHex = await this.getTransactionHex(utxo.txid);
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          nonWitnessUtxo: Buffer.from(txHex, 'hex'),
          tapInternalKey: internalPubkey,
          sequence: config?.sequence || sequence,
        });
      }
      
      // Set lock time if specified
      if (lockTime > 0) {
        psbt.setLocktime(lockTime);
      }

      // Add output for recipient
      psbt.addOutput({
        address: to,
        value: BigInt(amount.toString()),
      });

      // Add change output if necessary
      const change = totalInput.minus(totalOutput);
      if (change.gt(546)) { // Dust threshold
        psbt.addOutput({
          address: from,
          value: BigInt(change.toString()),
        });
      }

      // Sign all inputs
      for (let i = 0; i < selectedUtxos.length; i++) {
        psbt.signInput(i, keyPair);
      }

      // Finalize and extract transaction
      psbt.finalizeAllInputs();
      const txHex = psbt.extractTransaction().toHex();

      // Broadcast transaction
      const txHash = await this.broadcastTransaction(txHex);

      this.logger?.info('Bitcoin transaction sent', { 
        from, 
        to, 
        amount: amount.toString(), 
        fee: fee.toString(),
        txHash 
      });

      return {
        txHash,
        fee: fee,
        status: 'pending'
      };
    } catch (error) {
      this.logger?.error('Failed to send Bitcoin transaction', error as Error, { 
        from, 
        to, 
        amount: amount.toString() 
      });
      throw error;
    }
  }

  protected async getIncomingTransactions(address: string, seen: Set<string>): Promise<IncomingTransaction[]> {
    try {
      const response = await axios.get(
        `${this.config.explorer!.apiUrl}/address/${address}/txs`,
        { timeout: this.adapterConfig.timeout }
      );
      
      const transactions: Transaction[] = response.data;
      const incoming: IncomingTransaction[] = [];
      
      for (const tx of transactions) {
        if (seen.has(tx.txid)) continue;
        
        // Check if this transaction sends funds to our address
        for (const vout of tx.vout) {
          const outputAddress = await this.scriptPubkeyToAddress(vout.scriptpubkey);
          if (outputAddress === address) {
            incoming.push({
              txHash: tx.txid,
              from: 'unknown', // Bitcoin doesn't have explicit from addresses
              to: address,
              amount: new Big(vout.value),
              blockNumber: tx.status.block_height,
              timestamp: Date.now() // Would need additional API call for exact timestamp
            });
            break;
          }
        }
      }
      
      return incoming;
    } catch (error) {
      this.logger?.error('Failed to get incoming Bitcoin transactions', error as Error, { address });
      return [];
    }
  }

  // Helper methods

  private validateBitcoinAddress(address: string): void {
    // Bitcoin address validation regex (supports P2PKH, P2SH, Bech32, Taproot)
    const bitcoinAddressRegex = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/;
    if (!bitcoinAddressRegex.test(address)) {
      throw new Error(`Invalid Bitcoin address format: ${address}`);
    }
  }

  private async getUTXOs(address: string): Promise<UTXO[]> {
    const response = await axios.get(
      `${this.config.explorer!.apiUrl}/address/${address}/utxo`,
      { timeout: this.adapterConfig.timeout }
    );
    
    return response.data.filter((utxo: UTXO) => utxo.status.confirmed);
  }

  private async selectUTXOs(
    utxos: UTXO[], 
    amount: Big, 
    feeRate: Big = new Big(10),
    selectionStrategy: 'auto' | 'manual' | 'largest-first' | 'smallest-first' = 'auto'
  ): Promise<{
    selectedUtxos: UTXO[];
    totalInput: Big;
    fee: Big;
  }> {
    // Apply UTXO selection strategy
    let sortedUtxos: UTXO[];
    switch (selectionStrategy) {
      case 'largest-first':
        sortedUtxos = utxos.sort((a, b) => b.value - a.value);
        break;
      case 'smallest-first':
        sortedUtxos = utxos.sort((a, b) => a.value - b.value);
        break;
      case 'manual':
        // For manual selection, use UTXOs in the order provided
        sortedUtxos = [...utxos];
        break;
      case 'auto':
      default:
        // Auto: prefer largest first for efficiency
        sortedUtxos = utxos.sort((a, b) => b.value - a.value);
        break;
    }
    
    const selectedUtxos: UTXO[] = [];
    let totalInput = new Big(0);
    
    // Estimate fee using provided fee rate
    let estimatedSize = 10; // Base transaction size
    
    for (const utxo of sortedUtxos) {
      selectedUtxos.push(utxo);
      totalInput = totalInput.plus(utxo.value);
      estimatedSize += 148; // Input size for P2TR
      
      const outputCount = totalInput.minus(amount).gt(546) ? 2 : 1; // Change output if above dust
      const totalSize = estimatedSize + (outputCount * 34);
      const fee = new Big(totalSize).times(feeRate);
      
      if (totalInput.gte(amount.plus(fee))) {
        return { selectedUtxos, totalInput, fee };
      }
    }
    
    throw new Error('Insufficient UTXOs to cover amount and fees');
  }

  private async estimateFee(sizeBytes: number): Promise<Big> {
    try {
      // Get current fee estimates from Blockstream
      const response = await axios.get(
        `${this.config.explorer!.apiUrl}/fee-estimates`,
        { timeout: this.adapterConfig.timeout }
      );
      
      const feeRates = response.data;
      const mediumPriorityRate = feeRates['6'] || feeRates['3'] || 10; // sat/vB
      
      return new Big(sizeBytes).times(mediumPriorityRate);
    } catch (error) {
      this.logger?.warn('Failed to get dynamic fee estimate, using fallback', { error });
      // Fallback to 20 sat/vB
      return new Big(sizeBytes).times(20);
    }
  }

  private async getTransactionHex(txid: string): Promise<string> {
    const response = await axios.get(
      `${this.config.explorer!.apiUrl}/tx/${txid}/hex`,
      { timeout: this.adapterConfig.timeout }
    );
    return response.data;
  }

  private async broadcastTransaction(txHex: string): Promise<string> {
    const response = await axios.post(
      `${this.config.explorer!.apiUrl}/tx`,
      txHex,
      {
        headers: { 'Content-Type': 'text/plain' },
        timeout: this.adapterConfig.timeout
      }
    );
    return response.data;
  }

  private async scriptPubkeyToAddress(scriptPubkey: string): Promise<string> {
    // This would require implementing script parsing
    // For now, return a placeholder
    return 'unknown';
  }

  // Override base methods for Bitcoin-specific validation
  protected validateAddress(address: string): void {
    this.validateBitcoinAddress(address);
  }
}