// examples/2_adapters/solana_example.ts
import Big from "big.js";
import { exit } from "node:process";
import { SolanaAdapter } from "../../src/adapters/solana/SolanaAdapter.js";
import { generateEd25519Keypair, privToSeed } from "../../src/utils/keypair.js";
import { isAddress } from "gill";

(async () => {
  // 0. Generate a fresh ed25519 key (or use a fixed one for reproducible examples)
  const { privateKey } = await generateEd25519Keypair();
  // const privateKey = "3a84ae3e37f2f228b4bbb14ed032028a9e103248f834f52e8fce6de54e07c666";
  console.log("Private Key:", privateKey);
  const seed = privToSeed(privateKey);

  // 1. Instantiate your SolanaAdapter
  const solAdapter = new SolanaAdapter(seed);
  const deriveParams = {
    scope: "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain: "solana",
    index: "0",
  };

  // 2. Derive a Solana address
  const solAddress = await solAdapter.deriveAddress(deriveParams);
  if (isAddress(solAddress)) {
    console.log("Derived Solana Address:", solAddress);
  }

  // 3. Fetch lamport balance
  const balance = await solAdapter.balance(deriveParams);
  console.log("Lamport Balance:", balance.toString());

  // 4. Send lamports (if balance > 0)
  if (balance.gt(0)) {
    // Replace with a real recipient address when testing
    const recipient = "H3NR8Y1dWk1J4V2s5Lm9Qe4tZx7R2Kb8fJp3XqUwZdXE";
    const amount = Big(1000); // sending 1000 lamports

    const { txHash } = await solAdapter.send(
      deriveParams,
      recipient,
      amount
    );
    console.log("Transaction Signature:", txHash);
  }

  // 5. Subscribe to incoming transactions for this address
  console.log("Subscribing to incoming transactions (30 seconds)...");
  const subscription = await solAdapter.subscribe(
    solAddress,
    (txSig, amt) => {
      console.log("Incoming TX:", txSig, "Amount:", amt.toString());
    }
  );

  // Auto-unsubscribe after 30 seconds
  setTimeout(async () => {
    subscription.unsubscribe();
    exit(0);
  }, 30_000);
})();
