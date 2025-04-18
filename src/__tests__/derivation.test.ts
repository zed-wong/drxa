import { describe, it, expect } from "vitest";
import { deriveEntropy, deriveForChain } from "../utils/derivation";
import { SupportedChain } from "../constants/config";

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
      const params = { ...commonParams, chain: "ethereum" as SupportedChain };
      const result = deriveForChain(masterSeed, params);
      expect(result.chain).toBe("ethereum");
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/); // Ethereum address format
      expect(result.priv).toBeInstanceOf(Uint8Array);
      expect(result.priv.length).toBe(32);
    });

    // it("should derive Solana address correctly", () => {
    //   const params = { ...commonParams, chain: "solana" as SupportedChain };
    //   const result = deriveForChain(masterSeed, params);
    //   expect(result.chain).toBe("solana");
    //   expect(result.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // Base58 format
    //   expect(result.priv).toBeInstanceOf(Uint8Array);
    //   expect(result.priv.length).toBe(32);
    // });

    // it("should derive Polkadot address correctly", () => {
    //   const params = { ...commonParams, chain: "polkadot" as SupportedChain };
    //   const result = deriveForChain(masterSeed, params);
    //   expect(result.chain).toBe("polkadot");
    //   expect(result.address).toMatch(/^1[a-zA-Z0-9]{47}$/); // Polkadot address format
    //   expect(result.priv).toBeInstanceOf(Uint8Array);
    //   expect(result.priv.length).toBe(32);
    // });

    it("should derive Bitcoin address correctly", () => {
      const params = { ...commonParams, chain: "bitcoin" as SupportedChain };
      const result = deriveForChain(masterSeed, params);
      expect(result.chain).toBe("bitcoin");
      expect(result.address).toMatch(/^[a-fA-F0-9]{66}$/); // Compressed public key format
      expect(result.priv).toBeInstanceOf(Uint8Array);
      expect(result.priv.length).toBe(32);
    });

    it("should throw an error for unsupported chains", () => {
      const params = { ...commonParams, chain: "unsupported" as SupportedChain };
      expect(() => deriveForChain(masterSeed, params)).toThrow(
        "Unsupported chain: unsupported"
      );
    });
  });
});