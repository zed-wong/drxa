// examples/2_adapters/bitcoin_example.ts
import Big from "big.js";
import { exit } from "node:process";
import { generateEd25519Keypair, privToSeed } from "../../src/utils/keypair.js";
import { BitcoinAdapter } from "../../src/adapters/bitcoin/BitcoinAdapter.js";

(async () => {
  // 1. Generate or load your master seed (from an Ed25519 private key)
  const { privateKey } = await generateEd25519Keypair();
  console.log("ED25519 Private Key:", privateKey);
  const seed = privToSeed(privateKey);

  // 2. Initialize Bitcoin adapter
  const btcAdapter = new BitcoinAdapter(seed);

  // 3. Set up your derivation parameters
  const deriveParams = {
    scope:  "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain:  "bitcoin",
    index:  "0",
  };

  // 4. Derive a Taproot (P2TR) address
  const address = await btcAdapter.deriveAddress(deriveParams);
  console.log("Derived Bitcoin Taproot Address:", address);

  // 5. Fetch confirmed balance (in sats)
  const balance = await btcAdapter.balance(deriveParams);
  console.log("Balance (sats):", balance.toString());

  // 6. (Optional) Send sats if you have funds
  // Replace with a valid Bitcoin address and uncomment:
  const recipient = "bc1q...yourRecipientAddress...";
  if (balance.gt(0)) {
    const { txHash } = await btcAdapter.send(
      deriveParams,
      recipient,
      Big(1000),    // amount in sats
      2             // feeRate (sats/vByte)
    );
    console.log("Broadcasted TX Hash:", txHash);
  }

  // 7. Subscribe to new transactions (listens for 30 seconds)
  console.log("Listening for incoming transactions (listens for 30 seconds)... ");
  const sub = await btcAdapter.subscribe(address, (txHash, amount) => {
    console.log("Incoming TX:", txHash, "amount (sats):", amount.toString());
  });
  setTimeout(() => {
    sub.unsubscribe();
    console.log("Stopped subscription, exiting.");
    exit(0);
  }, 30000);
})();
