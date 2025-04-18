// src/__tests__/index.test.ts
import { WalletSDK } from "../index";
import { HDWallet } from "../core/HDWallet";
import { describe, it, expect, beforeAll } from "vitest";

let sdk: WalletSDK;

beforeAll(() => {
  const seed = new Uint8Array(32).fill(1); // Example seed
  sdk = new WalletSDK({ seed });
});


describe("WalletSDK", () => {
  it("should initialize with rpcEndpoints and register EVM adapters", () => {
    // No direct way to test internal state, but ensure no errors occur
    expect(sdk).toBeInstanceOf(WalletSDK);
  });

  it("should create a new HDWallet instance from a seed", async () => {
    const wallet = sdk.createWallet();
    const btc_address = await wallet.deriveAddress({ 
      scope: 'wallet',
      userId: '8a3c6134-a1de-467c-b2d3-075d138370a1',
      chain: 'bitcoin',
      index: '0'
     })
    const eth_address = await wallet.deriveAddress({ 
      scope: 'wallet',
      userId: '8a3c6134-a1de-467c-b2d3-075d138370a1',
      chain: 'ethereum',
      index: '0'
    })
    console.log('btc address:', btc_address)
    console.log('eth address:', eth_address)
    expect(wallet).toBeInstanceOf(HDWallet);
    expect(btc_address).toMatch(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/); // Basic regex for Bitcoin address
    expect(eth_address).toMatch(/^0x[a-fA-F0-9]{40}$/); // Basic regex for Ethereum address
  });
});