import { utils, etc, getPublicKeyAsync } from "@noble/ed25519";

/**
 * Generate a new Ed25519 keypair
 * @returns An object containing the private key and public key as hex strings
 */
export const generateEd25519Keypair = async (): Promise<{
  privateKey: string;
  publicKey: string;
}> => {
  const privateKeyUint8 = utils.randomPrivateKey();
  const privateKeyHex = etc.bytesToHex(privateKeyUint8);

  const publicKeyUint8 = await getPublicKeyAsync(privateKeyUint8);
  const publicKeyHex = etc.bytesToHex(publicKeyUint8);

  return {
    privateKey: privateKeyHex,
    publicKey: publicKeyHex,
  };
}

export const privToSeed = (privateKey: string) => {
  return Uint8Array.from(Buffer.from(privateKey, 'hex'))
}