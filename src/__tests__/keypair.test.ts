import { describe, it, expect } from "vitest";
import { generateEd25519Keypair } from "../utils/keypair.js";

// Test suite for generateEd25519Keypair

describe("generateEd25519Keypair", () => {
  it("should generate a valid Ed25519 keypair", async () => {
    const { privateKey, publicKey } = await generateEd25519Keypair();

    // Check that privateKey and publicKey are non-empty strings
    expect(privateKey).toBeDefined();
    expect(publicKey).toBeDefined();
    expect(typeof privateKey).toBe("string");
    expect(typeof publicKey).toBe("string");

    // Check that privateKey and publicKey have valid lengths
    expect(privateKey.length).toBe(64); // 32 bytes in hex
    expect(publicKey.length).toBe(64); // 32 bytes in hex
  });

  it("should generate unique keypairs on each call", async () => {
    const keypair1 = await generateEd25519Keypair();
    const keypair2 = await generateEd25519Keypair();

    // Ensure private keys and public keys are unique
    expect(keypair1.privateKey).not.toBe(keypair2.privateKey);
    expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
  });
});