# daddr

`daddr` is a deterministic multi-chain address SDK for Node.js. It allows you to derive and manage multiple addresses from an ed25519 private key or a 32 bits seed.

## Features

- **Multi-Chain Support**: Supports Ethereum, Bitcoin, Solana, and other popular blockchains.
- **Deterministic Address Derivation**: Derive addresses based on a master seed and chain-specific rules.
- **Unified API**: Simplified APIs for address derivation, transactions, and subscriptions.
- **Extensible Adapters**: Easily add support for new chains via custom adapters.

## Installation

To install dependencies, use [Bun](https://bun.sh):

```bash
bun install
```

## Building the SDK

To compile the TypeScript code into JavaScript:

```bash
bun run build
```

The compiled files will be output to the `dist/` directory.

## Running Examples

The `examples/` folder contains sample scripts demonstrating how to use the SDK. To run an example, follow these steps:

1. Build the project:
   ```bash
   bun run build
   ```

2. Run the desired example file. For example:
   ```bash
   bun run examples/1_derive_address.ts
   ```

## Usage

### Importing the SDK

```ts
import { WalletSDK } from "daddr";
```

### Initializing the SDK

Create an instance of the `WalletSDK` using a 32-byte master seed (e.g. ed25519 private key):

```ts
const seed = "6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6"; // Example seed
const sdk = new WalletSDK({ seed });
const wallet = sdk.createWallet();
```

### Deriving an Address

Derive an address for a specific chain and parameters:

```ts
const derivedAddress = await wallet.deriveAddress({
  scope: "wallet",
  userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
  chain: "ethereum",
  index: "0",
});

console.log("Derived Ethereum Address:", derivedAddress);
```

### Sending Transactions

Send a transaction from a derived address:

```ts
const txHash = await wallet.send(
  {
    scope: "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain: "ethereum",
    index: "0",
  },
  "0xRecipientAddress",
  1000000000000000000n // 1 ETH in wei
);

console.log("Transaction Hash:", txHash);
```

### Subscribing to Incoming Transfers

Subscribe to incoming transfers for a derived address:

```ts
const unsubscribe = await wallet.subscribe(
  {
    scope: "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain: "ethereum",
    index: "0",
  },
  (txHash, amount) => {
    console.log(`Incoming transaction: ${txHash}, Amount: ${amount}`);
  }
);

// To unsubscribe:
unsubscribe();
```

## Running Tests

The SDK uses [Vitest](https://vitest.dev/) for testing. To run the tests:

```bash
bun run test
```

## Project Structure

- **`src/`**: Contains the source code for the SDK.
  - **`adapters/`**: Chain-specific adapters for address derivation and transactions.
  - **`core/`**: Core classes like `HDWallet` and `ChainManager`.
  - **`utils/`**: Utility functions for keypair generation, address formatting, and derivation.
  - **`constants/`**: Configuration files for supported chains and RPC endpoints.
  - **`interfaces/`**: TypeScript interfaces for chain adapters.
- **`examples/`**: Example scripts demonstrating SDK usage.
- **`__tests__/`**: Unit tests for the SDK.

## Supported Chains

The SDK currently supports the following chains:

- Ethereum
- Binance Smart Chain (BSC)
- Polygon
- Avalanche
- Fantom
- Optimism
- Arbitrum
- Solana
- Bitcoin
- Polkadot
- Tron

## Extending the SDK

To add support for a new chain, implement the `IChainAdapter` interface and register the adapter with the `ChainManager`.

Example:

```ts
import { IChainAdapter } from "./interfaces/IChainAdapter.js";

class CustomChainAdapter implements IChainAdapter {
  chainName = "custom";

  async deriveAddress(params: DeriveParams): Promise<string> {
    // Custom address derivation logic
  }

  async send(path: string, to: string, amount: number | bigint): Promise<{ txHash: string }> {
    // Custom transaction logic
  }

  async subscribe(address: string, onIncoming: (txHash: string, amount: number | bigint) => void): Promise<{ unsubscribe: () => void }> {
    // Custom subscription logic
  }
}

// Register the adapter
ChainManager.register(new CustomChainAdapter());
```

## License

This project is licensed under the GPL-V3 License. See the [LICENSE](LICENSE) file for details.
