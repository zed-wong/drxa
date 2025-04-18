// src/utils/derivation.ts
import bs58 from "bs58";
import { Buffer } from "buffer";
import { createHmac } from "crypto";
import { keccak256 } from "js-sha3";
import { HDKey } from "@scure/bip32";
import { Keyring as PolkadotKeyring } from "@polkadot/api";
import { getPublicKey as getEd25519Pub } from "@noble/ed25519";
import { getPublicKey as getSecp256k1Pub } from "@noble/secp256k1";
import { SupportedChain } from "../constants/config";

export interface DeriveParams {
  scope: string;
  userId: string;
  chain: SupportedChain;
  index: string;
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
export function deriveForChain(
  masterSeed: Uint8Array,
  params: DeriveParams
) {
  const entropy = deriveEntropy(masterSeed, params);
  const priv = entropy.slice(0, 32); // use first 32 bytes as seed

  switch (params.chain) {
    case "eth": 
    case "base": 
    case "fantom": 
    case "polygon":
    case "ethereum": 
    case "optimism":
    case "arbitrum":
    case "avalanche": {
      // secp256k1: generate public key, remove prefix, then hash via keccak256
      const pub = getSecp256k1Pub(priv, true);
      const hash = keccak256(pub.slice(1));
      const address = `0x${hash.slice(-40)}`;
      return { priv, address, chain: params.chain };
    }
    case "bsc": 
    case "binance": {
      // secp256k1: same process as Ethereum
      const pub = getSecp256k1Pub(priv, true);
      const hash = keccak256(pub.slice(1));
      const address = `0x${hash.slice(-40)}`;
      return { priv, address, chain: "bsc" };
    }
    case "sol": 
    case "solana": {
      // Ed25519: public key encoded in Base58 is the address
      const pub = getEd25519Pub(priv);
      const address = bs58.encode(pub);
      return { priv, address, chain: "solana" };
    }
    case "dot": 
    case "polkadot": {
      // sr25519: use Polkadot keyring to derive address from seed
      const keyring = new PolkadotKeyring({ type: "sr25519" });
      const pair = keyring.addFromSeed(priv);
      return { priv, address: pair.address, chain: "polkadot" };
    }
    case "btc":
    case "bitcoin": {
      // BIP32 HD derivation: use entropy as master seed, derive m/0'
      const node = HDKey.fromMasterSeed(entropy);
      const child = node.derive("m/0'");
      if (!child.privateKey || !child.publicKey) {
        throw new Error("BTC address derivation failed: missing public or private key");
      }
      // For simplicity, return compressed public key as hex string (P2PKH formatting can be added)
      const address = Buffer.from(child.publicKey).toString("hex");
      return { priv: child.privateKey, address, chain: "bitcoin" };
    }
    default:
      throw new Error(`Unsupported chain: ${params.chain}`);
  }
}
