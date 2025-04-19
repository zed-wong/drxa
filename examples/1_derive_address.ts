// examples/1_derive_address.ts
import { exit } from "node:process";
import { WalletSDK } from "../src/index.js";

// Example usage of WalletSDK to derive an address
(async () => {
  const seed = "6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6"; // Example seed
  const sdk = new WalletSDK({ seed });
  const wallet = sdk.createWallet();

  const derivedAddress = await wallet.deriveAddress({
    scope: "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain: "ethereum",
    index: "0",
  });

  console.log("Derived Ethereum Address:", derivedAddress);
  exit(0);
})();