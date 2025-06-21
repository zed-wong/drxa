// src/adapters/tron/TronAdapter.ts
import { IChainAdapter, SupportedChain, ChainConfig, TransactionResponse, FeeEstimate } from "../../types/index.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import { keccak256 } from "js-sha3";
import { getPublicKey as getSecp256k1Pub } from "@noble/secp256k1";
import { TronWeb } from "tronweb";
import Big from "big.js";
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";

export interface TronConfig {
  /** HTTP endpoint for full node */
  fullHost?: string;
  /** Optional gRPC/solidity host (defaults to fullHost) */
  solidityHost?: string;
  /** Optional event server (defaults to empty) */
  eventHost?: string;
}

export class TronAdapter implements IChainAdapter {
  public readonly chainName: SupportedChain = "tron";
  public readonly config: ChainConfig = {
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
    category: 'other',
    endpoints: {
      http: {
        url: 'https://api.trongrid.io',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://tronscan.org'
    }
  };
  private tronWeb: TronWeb;
  private readonly tronConfig: TronConfig;
  private readonly masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array, config?: TronConfig) {
    const { http } = getRpcEndpoints('tron')!;
    this.tronConfig = config || {};
    this.tronWeb = new TronWeb({
      fullHost: config?.fullHost || http,
      solidityNode: config?.solidityHost || config?.fullHost || http,
      eventServer: config?.eventHost || http,
    });
    this.masterSeed = masterSeed;
    ChainManager.register(this);
  }

  /** Derive raw private key from masterSeed */
  private derivePrivKey(params: DeriveParams): Uint8Array {
    const entropy = deriveEntropy(this.masterSeed, params);
    return entropy.slice(0, 32);
  }

  /**
   * Derive a Tron address (Base58) from HMAC-SHA512-based entropy
   */
  public async deriveAddress(params: DeriveParams): Promise<string> {
    const privKey = this.derivePrivKey(params);
    const compressed = getSecp256k1Pub(privKey, true);
    const pubKey = compressed.slice(1);
    const ethHex = keccak256(pubKey).slice(-40);
    const hexAddress = "41" + ethHex;
    return this.tronWeb.address.fromHex(hexAddress);
  }

  /**
   * Get account balance (in TRX) for a given address
   */
  public async balance(params: DeriveParams): Promise<Big> {
    const address = await this.deriveAddress(params);
    const balanceSun = await this.tronWeb.trx.getBalance(address);
    return Big(balanceSun).div(1e6);
  }

  /**
   * Build, sign, and return a TRX transfer transaction
   */
  public async signTransaction(
    params: DeriveParams,
    to: string,
    amount: number
  ): Promise<any> {
    const privKey = this.derivePrivKey(params);
    const pkHex = Buffer.from(privKey).toString("hex");
    const defaultHex = typeof this.tronWeb.defaultAddress.hex === 'string' ? this.tronWeb.defaultAddress.hex : undefined;
    const rawTxn = await this.tronWeb.transactionBuilder.sendTrx(
      to,
      amount,
      defaultHex
    );
    const signedTxn = await this.tronWeb.trx.sign(rawTxn, pkHex);
    return signedTxn;
  }

  /**
   * Broadcast a signed transaction
   */
  public async broadcastTransaction(signedTxn: any): Promise<any> {
    return this.tronWeb.trx.sendRawTransaction(signedTxn);
  }

  /**
   * Send TRX from a derived address to another address
   */
  public async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<TransactionResponse> {
    const txn = await this.signTransaction(params, to, amount.toNumber());
    const result = await this.broadcastTransaction(txn);
    if (result.result) {
      return { 
        txHash: result.txid,
        status: 'pending'
      };
    } else {
      throw new Error(`Failed to send transaction: ${result.message}`);
    }
  }

  /**
   * Estimate fee for a TRX transfer
   */
  public async estimateFee(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<FeeEstimate> {
    // Tron network fees are generally 0 for TRX transfers; stub as 0
    const fee = new Big(0);
    return { 
      baseFee: fee,
      totalFee: fee
    };
  }
}
