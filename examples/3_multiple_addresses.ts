// examples/3_multiple_addresses.ts
import { exit } from "node:process";
import { generateEd25519Keypair, privToSeed } from "../src/utils/keypair.js";
import { BitcoinAdapter } from "../src/adapters/bitcoin/BitcoinAdapter.js";
import { EvmAdapter } from "../src/adapters/evm/EvmAdapter.js";
import { SolanaAdapter } from "../src/adapters/solana/SolanaAdapter.js";
import { randomUUID } from "node:crypto";

(async () => {
  // 1. Generate or load your master seed (from an Ed25519 private key)
  const { privateKey } = await generateEd25519Keypair();
  console.log("ED25519 Private Key:", privateKey);
  const seed = privToSeed(privateKey);

  // 2. Initialize Adapters
  const btcAdapter = new BitcoinAdapter(seed);
  const ethAdapter = new EvmAdapter(seed);
  const solAdapter = new SolanaAdapter(seed);
  // Add more adapter from the adapters folder as needed

  // 3. Set up your derivation parameters
  const deriveParams = {
    scope:  "wallet",     // Usage
    userId: "",           // User ID
    chain:  "",           // Chain
    index:  "0",          // Address Index of the user at the usage
  };


  // 4. Assume you fetched it from DB
  const users = (() => {
    let users: string[] = [];
    for (let i = 0; i < 20; i++) {
      // Generate a random UUID for each user
      const userId = randomUUID();
      users.push(userId);
    }
    return users;
  })()

  // 5. Derive a Taproot (P2TR) address for each user
  const addresses = await Promise.all(users.map(async (userId) => {
    const params = {
      ...deriveParams,
      userId,
    };
    const params1 = {
      ...params,
      index: "1",
    }
    const params2 = {
      ...params,
      index: "2",
    }
    return {
      params,
      btc: await btcAdapter.deriveAddress(params),
      btc1: await btcAdapter.deriveAddress(params1),
      btc2: await btcAdapter.deriveAddress(params2),
      eth: await ethAdapter.deriveAddress({ ...params, chain: "ethereum" }),
      eth1: await ethAdapter.deriveAddress({ ...params1, chain: "ethereum" }),
      eth2: await ethAdapter.deriveAddress({ ...params2, chain: "ethereum" }),
      sol: await solAdapter.deriveAddress({ ...params, chain: "solana" }),
      sol1: await solAdapter.deriveAddress({ ...params1, chain: "solana" }),
      sol2: await solAdapter.deriveAddress({ ...params2, chain: "solana" }),
    };

  }))
  console.log("Derived Bitcoin Taproot Addresses:\n", addresses);
  exit(0);
})();
