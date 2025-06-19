// src/__tests__/index.test.ts
import { WalletSDK } from "../index.js";
import { HDWallet } from "../core/HDWallet.js";
import { describe, it, expect, beforeAll } from "vitest";
import { SUPPORTED_CHAINS } from "../constants/config.js";
import { SupportedChain } from "../types/index.js";

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
});

describe("Test all SUPPORTED_CHAINS", () => {
  SUPPORTED_CHAINS.forEach((chain) => {
    it(`should derive address for ${chain}`, async () => {
      if (
        chain === ''
      ) {
        console.log(`Skipping unsupported chain: ${chain}`);
        return;
      }

      const address = await wallet.deriveAddress({
        scope: 'wallet',
        userId: '8a3c6134-a1de-467c-b2d3-075d138370a1',
        chain: chain as SupportedChain,
        index: '0'
      });
      console.log(`Address for ${chain}:`, address);
      
      // Basic regex for address validation (can be customized per chain if needed)
      const regexMap: Record<string, RegExp> = {
        bitcoin: /^bc1p[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/,
        ethereum: /^0x[a-fA-F0-9]{40}$/,
        solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
        tron: /^T[a-zA-Z0-9]{33}$/,
        aptos: /^(0x)?[0-9a-f]{64}$/,
        polkadot: /^[1-9A-HJ-NP-Za-km-z]{47,48}$/,
        cardano: /^(addr1|DdzFFzCqrhsg)[a-zA-Z0-9]{58}$/,
        algorand: /^[A-Z2-7]{58}$/,
        near: /^([a-zA-Z0-9_-]{1,64}\.[a-zA-Z0-9_-]{1,64})$/,
        cosmos: /^[a-z0-9]{40}$/,
        tezos: /^tz1[a-zA-Z0-9]{33}$/,
        zilliqa: /^0x[a-fA-F0-9]{40}$/,
        filecoin: /^(f1|f3|f4)[a-zA-Z0-9]{40}$/,
        bsc: /^0x[a-fA-F0-9]{40}$/,
        cronos: /^0x[a-fA-F0-9]{40}$/,
        polygon: /^0x[a-fA-F0-9]{40}$/,
        avalanche: /^0x[a-fA-F0-9]{40}$/,
        optimism: /^0x[a-fA-F0-9]{40}$/,
        arbitrum: /^0x[a-fA-F0-9]{40}$/,
        sonic: /^0x[a-fA-F0-9]{40}$/,
        default: /^[a-zA-Z0-9]{32,66}$/,
      };
      const regex = regexMap[chain] || regexMap.default;
      expect(address).toMatch(regex);
    });
  });
});