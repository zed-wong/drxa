// src/__tests__/wallet.test.ts
import { describe, it, expect } from "vitest";
import { HDWallet } from "../core/HDWallet";
import { registerEvmAdapters } from "../adapters/evm/EvmAdapter";
import { registerBitcoinAdapter } from "../adapters/bitcoin/BitcoinAdapter";
import { registerSolanaAdapter } from "../adapters/solana/SolanaAdapter";

const SEED = new Uint8Array(32); // dummy seed (all zero)

describe("HDWallet Derivation", () => {
  it("derives a valid Ethereum address", async () => {
    registerEvmAdapters(SEED);
    const wallet = new HDWallet(SEED);
    const addr = await wallet.deriveAddress({
      scope: "wallet",
      userId: "testuser",
      chain: "ethereum",
      index: "0",
    });
    console.log("Ethereum address:", addr);
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("derives a valid Bitcoin P2TR address", async () => {
    registerBitcoinAdapter(SEED);
    const wallet = new HDWallet(SEED);
    const addr = await wallet.deriveAddress({
      scope: 'wallet',
      userId: '8a3c6134-a1de-467c-b2d3-075d138370a1',
      chain: 'bitcoin',
      index: '0'
    });
    console.log("Bitcoin address:", addr);
    expect(addr, "Bitcoin address should be valid").toMatch(
      /^bc1p[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/
    );
  });

  it("derives a valid Solana address", async () => {
    registerSolanaAdapter(SEED);
    const wallet = new HDWallet(SEED);
  
    const addr = await wallet.deriveAddress({
      scope: "wallet",
      userId: "testuser",
      chain: "solana",
      index: "0",
    });
   
    console.log("Solana address:", addr);
    // Solana addresses are Base58, typically 32–44 chars
    expect(addr).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});
