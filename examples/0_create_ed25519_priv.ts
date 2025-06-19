/*
import { exit } from "node:process";
import { generateEd25519Keypair } from "../src/utils/keypair";

(async () => {
  // 1) Generate a fresh Ed25519 keypair (32-byte seed + raw public key)
  const { privateKey: seedHex, publicKey: rawPubHex } =
    await generateEd25519Keypair();
  console.log("Seed (hex):", seedHex);
  console.log("Raw public key (hex):", rawPubHex);
  console.log();
  exit(0);
})();
*/

import { exit } from "node:process";
import { createPublicKey, createPrivateKey } from "crypto";
import {
  generateEd25519Keypair,   // raw hex seed & pub from @noble/ed25519
  generateEd25519PemPair,   // new helper using crypto.generateKeyPairSync
} from "../src/utils/keypair";

(async () => {
  // 1) Get raw seed & public key hex
  const { privateKey: seedHex, publicKey: rawPubHex } =
    await generateEd25519Keypair();
  console.log("Seed (hex):", seedHex);
  console.log("Raw public key (hex):", rawPubHex);

  // 2) Generate PEM-encoded key pair (SPKI public + PKCS#8 private)
  const { publicKey: spkiPem, privateKey: pkcs8Pem } =
    generateEd25519PemPair();
  console.log(`\n=== SPKI Public Key PEM ===\n ${spkiPem}`);
  console.log(`=== PKCS#8 Private Key PEM ===\n ${pkcs8Pem}`);

  // 3) Optional: parse back to verify types
  const pubObj  = createPublicKey(spkiPem);
  const privObj = createPrivateKey(pkcs8Pem);
  console.log(
    "\nParsed key types:",
    pubObj.asymmetricKeyType,    // should be 'ed25519'
    privObj.asymmetricKeyType   // should be 'ed25519'
  );

  exit(0);
})();

