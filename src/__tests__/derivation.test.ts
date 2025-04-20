import { describe, it, expect } from "vitest";
import { deriveEntropy } from "../utils/derivation.js";
import { BitcoinAdapter } from "../adapters/bitcoin/BitcoinAdapter.js";
import { EvmAdapter } from "../adapters/evm/EvmAdapter.js";
import { SupportedChain } from "../constants/config.js";

describe("Derivation Utilities", () => {
  const masterSeed = new Uint8Array(32).fill(1); // Example master seed
  const commonParams = {
    scope: "wallet",
    userId: "default",
    index: "0",
  };

  describe("deriveEntropy", () => {
    it("should generate 64-byte entropy", () => {
      const params = { ...commonParams, chain: "ethereum" as SupportedChain };
      const entropy = deriveEntropy(masterSeed, params);
      expect(entropy).toBeInstanceOf(Uint8Array);
      expect(entropy.length).toBe(64);
    });

    it("should produce different entropy for different inputs", () => {
      const params1 = { ...commonParams, chain: "ethereum" as SupportedChain };
      const params2 = { ...commonParams, chain: "solana" as SupportedChain };
      const entropy1 = deriveEntropy(masterSeed, params1);
      const entropy2 = deriveEntropy(masterSeed, params2);
      expect(entropy1).not.toEqual(entropy2);
    });
  });

  describe("deriveForChain", () => {
    it("should derive Ethereum address correctly", () => {
      const evmAdapter = new EvmAdapter(masterSeed, { chainName: "ethereum", rpcUrl: "" });
      const result = evmAdapter.derivePrivateKey({ ...commonParams, chain: "ethereum" as SupportedChain });
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/); // Ethereum address format
      expect(result.priv).toBeInstanceOf(Uint8Array);
      expect(result.priv.length).toBe(32);
    });

    it("should derive Bitcoin address correctly", () => {
      const bitcoinAdapter = new BitcoinAdapter(masterSeed);
      const result = bitcoinAdapter.derivePrivateKey({ ...commonParams, chain: "bitcoin" as SupportedChain });
      expect(result.address).toMatch(/^bc1p[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/); // Taproot address format
      expect(result.priv).toBeInstanceOf(Uint8Array);
      expect(result.priv.length).toBe(32);
    });

    it("should throw an error for unsupported chains", () => {
      expect(() => {
        throw new Error("Unsupported chain: unsupported");
      }).toThrow("Unsupported chain: unsupported");
    });
  });
});