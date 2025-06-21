import Big from 'big.js';
import { Keyring } from '@polkadot/keyring';
import { ApiPromise, WsProvider } from '@polkadot/api';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountInfo } from '@polkadot/types/interfaces';
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import { IChainAdapter, SupportedChain, ChainConfig, TransactionResponse } from "../../types/index.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";

export interface PolkadotConfig {
  wsUrl?: string;
}

export class PolkadotAdapter implements IChainAdapter {
  public readonly chainName: SupportedChain = "polkadot";
  public readonly config: ChainConfig = {
    name: 'Polkadot',
    symbol: 'DOT',
    decimals: 10,
    category: 'other',
    endpoints: {
      http: {
        url: 'wss://rpc.polkadot.io',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://polkadot.subscan.io'
    }
  };
  private readonly wsUrl: string;
  private readonly masterSeed: Uint8Array;
  private api: ApiPromise | null = null;

  constructor(masterSeed: Uint8Array, config: PolkadotConfig = {}) {
    const endpoints = getRpcEndpoints(this.chainName);
    this.wsUrl = config.wsUrl ?? endpoints.ws ?? endpoints.http;
    this.masterSeed = masterSeed;
    ChainManager.register(this);
  }

  private async initApi(): Promise<ApiPromise> {
    if (!this.api) {
      const provider = new WsProvider(this.wsUrl);
      this.api = await ApiPromise.create({ provider });
    }
    return this.api;
  }

  /**
   * Derive a Polkadot address using sr25519 from HMAC entropy.
   */
  public async deriveAddress(params: DeriveParams): Promise<string> {
    const entropy = deriveEntropy(this.masterSeed, params);
    const seed = entropy.slice(0, 32);
    const keyring = new Keyring({ type: 'sr25519' });
    const pair = keyring.addFromSeed(seed);
    return pair.address;
  }

  /**
   * Fetches the free balance for derived address in Planck as Big.
   */
  public async balance(params: DeriveParams): Promise<Big> {
    const address = await this.deriveAddress(params);
    const api = await this.initApi();
    const account = (await api.query.system.account(address)) as AccountInfo;
    const free = account.data.free;
    return new Big(free.toString());
  }

  /**
   * Sends a balance transfer (raw Planck amount) from derived seed.
   */
  public async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<TransactionResponse> {
    const entropy = deriveEntropy(this.masterSeed, params);
    const seed = entropy.slice(0, 32);
    const keyring = new Keyring({ type: 'sr25519' });
    const pair = keyring.addFromSeed(seed);
    const txHash = await this.signAndSend(pair, to, amount.toString());
    return { 
      txHash,
      status: 'pending'
    };
  }

  /**
   * Internal helper to sign and send a balances.transfer extrinsic.
   */
  private async signAndSend(
    pair: KeyringPair,
    to: string,
    amount: string
  ): Promise<string> {
    const api = await this.initApi();
    return new Promise((resolve, reject) => {
      api.tx.balances
        .transfer(to, amount)
        .signAndSend(pair, ({ status, dispatchError, txHash }) => {
          if (dispatchError) {
            reject(dispatchError);
          } else if (status.isInBlock || status.isFinalized) {
            resolve(txHash.toHex());
          }
        })
        .catch(reject);
    });
  }
}
