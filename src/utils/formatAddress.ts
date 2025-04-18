import { keccak256 } from "js-sha3";

/**
 * Format a 32-byte public key into a hex EVM address.
 */
export function formatHexAddress(pub: Uint8Array): string {
  const hash = keccak256(pub.slice(-64));
  return "0x" + hash.slice(-40);
}