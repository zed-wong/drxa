// src/index.ts
import * as ecc from 'tiny-secp256k1';
import { initEccLib } from 'bitcoinjs-lib';

import { HDWallet } from "./core/HDWallet.js";
import { setRpcOverride } from "./constants/config.js";
import type { RpcEndpoints } from "./constants/config.js";
import { registerAllAdapters } from './adapter.js';

initEccLib(ecc);
export interface SdkOptions {
  /** Your 32-byte Ed25519 master seed */
  seed: Uint8Array | string;

  /** Optional overrides for chain RPC, WS, explorer, and explorer API endpoints */
  rpcEndpoints?: Record<string, RpcEndpoints>;
}

export class WalletSDK {
  private seed: Uint8Array;
  public wallet: HDWallet;

  constructor(options: SdkOptions) {
    if (typeof options.seed === 'string') {
      this.seed = Uint8Array.from(Buffer.from(options.seed, 'hex'));
    } else {
      this.seed = options.seed;
    }

    if (options.rpcEndpoints) {
      Object.entries(options.rpcEndpoints).forEach(([chain, eps]) => {
        setRpcOverride(chain, eps);
      });
    }

    this.wallet = new HDWallet(this.seed);
    registerAllAdapters(this.seed);
  }

  /**
   * Optional: create a fresh HDWallet manually (same seed)
   */
  createWallet(): HDWallet {
    return new HDWallet(this.seed);
  }
}
