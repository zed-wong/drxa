// examples/2_adapters/tron_example.ts
import Big from "big.js";
import { exit } from "node:process";
import { TronAdapter, TronConfig } from "../../src/adapters/tron/TronAdapter.js";
import { generateEd25519Keypair, privToSeed } from "../../src/utils/keypair.js";

;(async () => {
  // 1. Generate a master seed from Ed25519 keypair
  const { privateKey } = await generateEd25519Keypair();
  // Or for consistent results in testing:
  // const privateKey = '3a84ae3e37f2f228b4bbb14ed032028a9e103248f834f52e8fce6de54e07c666';
  console.log("Private Key:", privateKey);
  const seed = privToSeed(privateKey);

  // 2. Configure and instantiate TronAdapter
  const config: TronConfig = {
    fullHost: "https://api.trongrid.io",       // mainnet full node
    solidityHost: "https://api.trongrid.io",   // optional solidity node
    eventHost: "https://api.trongrid.io"
  };
  const tronAdapter = new TronAdapter(seed, config);

  // Derivation parameters (must match those used by your app)
  const deriveParams = {
    scope: "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain: "tron",
    index: "0"
  };

  // 3. Derive a Tron address
  const address = await tronAdapter.deriveAddress(deriveParams);
  console.log("Derived Tron Address:", address);

  // 4. Fetch account balance
  const balance = await tronAdapter.balance(deriveParams);
  console.log("TRX Balance:", balance.toString());

  // 5. Estimate fee for sending 1 TRX
  const feeEst = await tronAdapter.estimateFee(deriveParams, "TDKuQqBkc6GicjFDz5heVUJq2w6GRGJPpT", Big(1));
  console.log("Fee Estimate:", feeEst);

  // 6. Send 0.1 TRX if balance sufficient
  if (balance.gt(0.1)) {
    try {
      const result = await tronAdapter.send(
        deriveParams,
        "TDKuQqBkc6GicjFDz5heVUJq2w6GRGJPpT",
        Big(0.1)
      );
      console.log("Transaction Hash:", result.txHash);
    } catch (e) {
      console.error("Send Error:", (e as Error).message);
    }
  }

  exit(0);
})();
