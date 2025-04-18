import { utils, etc, getPublicKeyAsync } from "@noble/ed25519";

/**
 * Generate a new Ed25519 keypair
 * @returns An object containing the private key and public key as Uint8Array
 */
export async function generateEd25519Keypair(): Promise<{
  privateKey: string;
  publicKey: string;
}>{
  const privateKeyUint8 = utils.randomPrivateKey();
  const hexKey1 = etc.bytesToHex(privateKeyUint8);
  const privateKey = Buffer.from(hexKey1).toString('hex');

  const publicKeyUint8 = await getPublicKeyAsync(privateKey)
  const hexKey2 = etc.bytesToHex(publicKeyUint8);
  const publicKey = Buffer.from(hexKey2).toString('hex');

  console.log("Private Key:", privateKey);
  console.log("Public Key:", publicKey);
  return {
    privateKey,
    publicKey,
  };
}