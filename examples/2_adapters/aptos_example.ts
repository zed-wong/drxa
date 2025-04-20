// examples/2_adapters/aptos_example.ts
import Big from "big.js";
import { exit } from "node:process";
import { DeriveParams } from "../../src/utils/derivation.js";
import { AptosAdapter } from "../../src/adapters/aptos/AptosAdapter.js";
import { generateEd25519Keypair, privToSeed } from "../../src/utils/keypair.js";

(async () => {
  // 0. Generate a fresh ed25519 keypair & seed
  const { privateKey } = await generateEd25519Keypair();
  console.log("Private Key:", privateKey);
  const seed = privToSeed(privateKey);

  // 1. Instantiate the AptosAdapter (uses default RPC if none provided)
  const aptosAdapter = new AptosAdapter(seed /*, { rpcUrl: "https://fullnode.mainnet.aptoslabs.com" } */);

  // Common derive parameters
  const deriveParams: DeriveParams = {
    scope: "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain: "aptos",
    index: "0",
  };

  // 2. Derive Aptos address
  const derivedAddress = await aptosAdapter.deriveAddress(deriveParams);
  console.log("Derived Aptos Address:", derivedAddress);

  // 3. Fetch AptosCoin balance (not working yet)
  // const balance = await aptosAdapter.balance(deriveParams);
  // console.log("AptosCoin Balance (OCTOS):", balance.toString());

  // // 4. Send AptosCoin if balance is sufficient
  // if (balance.gt(0)) {
  //   const recipient = "f1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0"; // replace with real hex‑encoded address
  //   const amount = Big(1); // send 1 OCTO

  //   console.log(`Sending ${amount.toString()} OCTO to ${recipient}...`);
  //   const { txHash } = await aptosAdapter.send(deriveParams, recipient, amount);
  //   console.log("Transaction Hash:", txHash);
  // } else {
  //   console.log("Insufficient AptosCoin balance, skipping send.");
  // }

  // exit(0);
})();
