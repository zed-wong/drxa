import { describe, it, expect } from "vitest";
import { createPublicKey, createPrivateKey } from 'crypto';
import { generateEd25519Keypair, generateEd25519PemPair } from "../../utils/keypair.js";

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


it('generateEd25519PemPair produces valid PEM keys', () => {
  const { publicKey, privateKey } = generateEd25519PemPair();

  // Public key must use SPKI PEM: check RFC7468 header/footer
  expect(publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);   // PEM header :contentReference[oaicite:3]{index=3}
  expect(publicKey).toMatch(/\n-----END PUBLIC KEY-----\n$/);   // PEM footer :contentReference[oaicite:4]{index=4}

  // Private key must use PKCS#8 PEM: check header/footer
  expect(privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----\n/); // PEM header :contentReference[oaicite:5]{index=5}
  expect(privateKey).toMatch(/\n-----END PRIVATE KEY-----\n$/); // PEM footer :contentReference[oaicite:6]{index=6}
});

it('generated PEM keys parse and identify as ed25519', () => {
  const { publicKey, privateKey } = generateEd25519PemPair();

  // Parse SPKI public key and verify type
  const pubObj = createPublicKey(publicKey);
  expect(pubObj.asymmetricKeyType).toBe('ed25519');             // crypto.createPublicKey :contentReference[oaicite:7]{index=7}

  // Parse PKCS#8 private key and verify type
  const privObj = createPrivateKey(privateKey);
  expect(privObj.asymmetricKeyType).toBe('ed25519');            // crypto.createPrivateKey :contentReference[oaicite:8]{index=8}
});
