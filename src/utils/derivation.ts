// src/utils/derivation.ts
import { Buffer } from "buffer";
import { createHmac } from "crypto";
import { SupportedChain } from "../constants/config.js";

export interface DeriveParams {
  scope: string;                  // Usage (wallet, session, order)
  userId: string;                 // Unique identifier (uuid)
  chain: SupportedChain;          // Chain identifier (bitcoin, ethereum)
  index: string;                  // Multiple addresses (0, 1, temp-001)
}

/**
 * Generate 64-byte entropy by computing HMAC-SHA512(masterSeed, entropyInput)
 */
export function deriveEntropy(
  masterSeed: Uint8Array,
  { scope, userId, chain, index }: DeriveParams
): Uint8Array {
  const input = `${scope}:${userId}:${chain}:${index}`;
  const hmac = createHmac("sha512", Buffer.from(masterSeed));
  hmac.update(input);
  return hmac.digest(); // returns 64-byte buffer
}

/**
 * Derive private key and address from entropy based on chain-specific rules
 */
export function deriveForChain(masterSeed: Uint8Array, params: DeriveParams) {
  const entropy = deriveEntropy(masterSeed, params);
  const priv = entropy.slice(0, 32); // use first 32 bytes as seed

  // Delegate derivation to the appropriate adapter
  switch (params.chain) {
    case "bsc": case "base": case "polygon":
    case "ethereum": case "optimism": case "arbitrum": case "avalanche":
      return { priv, chain: params.chain };
    case "sol": case "solana":
      return { priv, chain: "solana" };
    case "dot": case "polkadot":
      return { priv, chain: "polkadot" };
    case "btc": case "bitcoin":
      return { priv, chain: "bitcoin" };
    default:
      throw new Error(`Unsupported chain: ${params.chain}`);
  }
}
