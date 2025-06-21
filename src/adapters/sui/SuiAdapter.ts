import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import { IChainAdapter, SupportedChain, ChainConfig, TransactionResponse, FeeEstimate, TransactionHistory, SubscriptionCallback, Unsubscribe } from "../../types/index.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";

import Big from "big.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

export interface SuiConfig {
  rpcUrl?: string;
  faucetUrl?: string;
  debug?: boolean;
}

export class SuiAdapter implements IChainAdapter {
  public readonly chainName: SupportedChain = "sui";
  public readonly config: ChainConfig = {
    name: 'Sui',
    symbol: 'SUI',
    decimals: 9,
    category: 'other',
    endpoints: {
      http: {
        url: 'https://fullnode.mainnet.sui.io',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://suiscan.xyz'
    }
  };
  private readonly masterSeed: Uint8Array;
  private readonly provider: SuiClient;

  constructor(masterSeed: Uint8Array, config: SuiConfig = {}) {
    this.masterSeed = masterSeed;

    const defaultRpc = getRpcEndpoints("sui");
    const rpcUrl = config.rpcUrl || defaultRpc.http;

    this.provider = new SuiClient({ url: rpcUrl });

    if (config.debug) {
      console.log(`[SuiAdapter] RPC: ${rpcUrl}`);
    }

    ChainManager.register(this);
  }

  private derive(params: DeriveParams): { keypair: Ed25519Keypair; address: string } {
    const entropy = deriveEntropy(this.masterSeed, { ...params, chain: "sui" });
    const seed = entropy.slice(0, 32);
    const keypair = Ed25519Keypair.fromSecretKey(seed);
    const address = keypair.getPublicKey().toSuiAddress();
    return { keypair, address };
  }

  async deriveAddress(params: DeriveParams): Promise<string> {
    return this.derive(params).address;
  }

  async balance(params: DeriveParams): Promise<Big> {
    const { address } = this.derive(params);
    const coins = await this.provider.getCoins({ owner: address });
    const total = coins.data.reduce((sum: bigint, coin: any) => sum + BigInt(coin.balance), BigInt(0));
    return Big(total.toString()).div(1e9); // Convert from MIST to SUI
  }

  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<TransactionResponse> {
    const { keypair, address } = this.derive(params);

    // Build a new transaction
    const tx = new Transaction();
    
    // Convert amount to MIST (1 SUI = 10^9 MIST)
    const amountInMist = amount.times(1e9).toFixed(0);
    
    // Split coins and transfer
    const [coin] = tx.splitCoins(tx.gas, [amountInMist]);
    tx.transferObjects([coin], to);
    
    // Execute transaction
    const result = await this.provider.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
    });

    return { 
      txHash: result.digest,
      status: 'confirmed'
    };
  }

  async estimateFee(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<FeeEstimate> {
    const { keypair, address } = this.derive(params);

    // Build a dummy transaction for gas estimation
    const tx = new Transaction();
    const amountInMist = amount.times(1e9).toFixed(0);
    const [coin] = tx.splitCoins(tx.gas, [amountInMist]);
    tx.transferObjects([coin], to);
    
    // Dry run to estimate gas
    const dryRun = await this.provider.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client: this.provider }),
    });

    const totalGas = Number(dryRun.effects.gasUsed.computationCost) + Number(dryRun.effects.gasUsed.storageCost);
    const fee = Big(totalGas).div(1e9); // Convert from MIST to SUI
    return { 
      baseFee: fee,
      totalFee: fee
    };
  }

  async subscribe(
    address: string,
    callback: SubscriptionCallback
  ): Promise<Unsubscribe> {
    // Placeholder for future WebSocket support
    throw new Error("Sui does not yet support push transaction subscription in this adapter.");
  }

  async getHistory(
    params: DeriveParams,
    limit?: number
  ): Promise<TransactionHistory[]> {
    // Not currently supported via public API without external indexer
    throw new Error("Sui getHistory is not implemented (no public indexer available).");
  }
}
