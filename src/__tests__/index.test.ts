// src/__tests__/index.test.ts
import { WalletSDK } from "../index.js";
import { HDWallet } from "../core/HDWallet.js";
import { describe, it, expect, beforeAll } from "vitest";
import { SUPPORTED_CHAINS } from "../constants/config.js";

let seed: string;
let sdk: WalletSDK;
let wallet: HDWallet;

beforeAll(() => {
  seed = '6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6'
  sdk = new WalletSDK({ seed });
  wallet = sdk.createWallet();
});

describe("WalletSDK", () => {
  it("should create a new HDWallet instance from a seed", async () => {
    console.log('seed:' , seed);
    expect(wallet).toBeInstanceOf(HDWallet);
  });

  // it("should derive BTC address", async () => {
  //   const btc_address = await wallet.deriveAddress({ 
  //     scope: 'wallet',
  //     userId: '8a3c6134-a1de-467c-b2d3-075d138370a1',
  //     chain: 'bitcoin',
  //     index: '0'
  //    });
  //    console.log('btc address:', btc_address);
  //    expect(btc_address).toMatch(/^bc1p[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/); // Updated regex for Bitcoin Taproot address
  // })

  // it("should derive EVM address", async () => {
  //   const eth_address = await wallet.deriveAddress({ 
  //     scope: 'wallet',
  //     userId: '8a3c6134-a1de-467c-b2d3-075d138370a1',
  //     chain: 'ethereum',
  //     index: '0'
  //   });
  //   console.log('eth address:', eth_address);
  //   expect(eth_address).toMatch(/^0x[a-fA-F0-9]{40}$/); // Basic regex for Ethereum address
  // })

  
  // it("should derive Solana address", async () => {
  //   const sol_address = await wallet.deriveAddress({ 
  //     scope: 'wallet',
  //     userId: '8a3c6134-a1de-467c-b2d3-075d138370a1',
  //     chain: 'ethereum',
  //     index: '0'
  //   });
  //   console.log('sol address:', sol_address);
  //   expect(sol_address).toMatch(/^0x[a-fA-F0-9]{40}$/); // Basic regex for Ethereum address
  // })
});

describe("WalletSDK - SUPPORTED_CHAINS", () => {
  SUPPORTED_CHAINS.forEach((chain) => {
    it(`should derive address for ${chain}`, async () => {
      const address = await wallet.deriveAddress({
        scope: 'wallet',
        userId: '8a3c6134-a1de-467c-b2d3-075d138370a1',
        chain,
        index: '0'
      });
      console.log(`${chain} address:`, address);
      
      // Basic regex for address validation (can be customized per chain if needed)
      const regexMap: Record<string, RegExp> = {
        bitcoin: /^bc1p[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/,
        ethereum: /^0x[a-fA-F0-9]{40}$/,
        solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
        tron: /^T[a-zA-Z0-9]{33}$/,
        default: /^[a-zA-Z0-9]{32,44}$/,
      };
      const regex = regexMap[chain] || regexMap.default;
      expect(address).toMatch(regex);
    });
  });
});