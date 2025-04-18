// src/index.ts
import * as ecc from 'tiny-secp256k1';
import { initEccLib } from 'bitcoinjs-lib';

import { HDWallet } from "./core/HDWallet";
import { setRpcOverride } from "./constants/config";
import type { RpcEndpoints } from "./constants/config";
import { registerEvmAdapters } from "./adapters/evm/EvmAdapter";
import { registerBitcoinAdapter } from "./adapters/bitcoin/BitcoinAdapter";

initEccLib(ecc);
export interface SdkOptions {
  /** Your 32-byte Ed25519 master seed */
  seed: Uint8Array;

  /** Optional overrides for chain RPC, WS, explorer, and explorer API endpoints */
  rpcEndpoints?: Record<string, RpcEndpoints>;
}

export class WalletSDK {
  private seed: Uint8Array;
  public wallet: HDWallet;

  constructor(options: SdkOptions) {
    this.seed = options.seed;

    if (options.rpcEndpoints) {
      Object.entries(options.rpcEndpoints).forEach(([chain, eps]) => {
        setRpcOverride(chain, eps);
      });
    }

    // Register all adapters using this seed
    registerEvmAdapters(this.seed);
    registerBitcoinAdapter(this.seed);

    this.wallet = new HDWallet(this.seed);
  }

  /**
   * Optional: create a fresh HDWallet manually (same seed)
   */
  createWallet(): HDWallet {
    return new HDWallet(this.seed);
  }
}
