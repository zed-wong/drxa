import { exit } from "node:process";
import { generateEd25519Keypair } from "../src/utils/keypair";

(async () => {
  const { privateKey, publicKey } = await generateEd25519Keypair()
  console.log("Private Key:", privateKey);
  console.log("Public Key:", publicKey);
  exit(0)
})()