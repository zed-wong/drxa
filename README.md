# Drxa

`Drxa` (/ˈdræksə/) is a state-of-the-art deterministic multi-chain address SDK for Node.js. It allows you to derive unlimited addresses with a single ed25519 private key or 32-byte seed, featuring enterprise-grade architecture with plugin-based adapters, event-driven subscriptions, and comprehensive error handling.

## ✨ Features

- **🌐 Multi-Chain Support**: Supports 15+ blockchains including Bitcoin, Ethereum, Solana, TON, EOS, NEAR, and all major EVM chains
- **🔑 Deterministic Address Derivation**: Generate unlimited addresses from a single master seed using HMAC-SHA512
- **🏗️ Enterprise Architecture**: Plugin-based adapter system with lazy loading and connection pooling
- **⚡ Event-Driven Subscriptions**: Real-time transaction monitoring with filtered event streams
- **🛡️ Robust Error Handling**: Custom error system with retry logic, circuit breakers, and exponential backoff
- **📊 Built-in Metrics**: Performance monitoring and diagnostics for production use
- **🧪 Comprehensive Testing**: 85+ tests covering all functionality with mock adapters for offline testing
- **🔌 Extensible Plugin System**: Easy integration of custom adapters and external adapter packages
- **💾 Memory Efficient**: Connection pooling and automatic resource cleanup prevent memory leaks
- **🔒 Type-Safe**: Full TypeScript support with runtime validation and no `any` types

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

## 🚀 Quick Start

### Installation

```bash
npm install drxa
# or
bun add drxa
```

### Basic Usage

```ts
import { AdapterRegistry } from 'drxa';
import { registerBuiltInAdapters } from 'drxa/adapters';

// Initialize the SDK
const masterSeed = new Uint8Array(32); // Your 32-byte master seed
const registry = AdapterRegistry.getInstance();
registry.initialize(masterSeed);

// Register built-in adapters
registerBuiltInAdapters(registry);

// Load an adapter for a specific chain
const bitcoinAdapter = await registry.loadAdapter('bitcoin');

// Derive an address
const address = await bitcoinAdapter.deriveAddress({
  scope: "wallet",
  userId: "123e4567-e89b-12d3-a456-426614174000",
  chain: "bitcoin",
  index: "0"
});

console.log("Bitcoin Address:", address);
```

### Advanced Usage Examples

#### 💰 Check Balance and Send Transaction

```ts
import Big from 'big.js';

// Get balance
const balance = await bitcoinAdapter.balance({
  scope: "wallet",
  userId: "123e4567-e89b-12d3-a456-426614174000", 
  chain: "bitcoin",
  index: "0"
});

console.log(`Balance: ${balance.toString()} satoshis`);

// Send transaction
if (balance.gt(new Big('100000'))) { // If balance > 0.001 BTC
  const result = await bitcoinAdapter.send(
    {
      scope: "wallet",
      userId: "123e4567-e89b-12d3-a456-426614174000",
      chain: "bitcoin", 
      index: "0"
    },
    "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", // Recipient address
    new Big('50000') // 0.0005 BTC
  );
  
  console.log("Transaction Hash:", result.txHash);
}
```

#### 📡 Real-time Monitoring

```ts
// Subscribe to incoming transactions
const unsubscribe = await bitcoinAdapter.subscribe(
  address,
  (transaction) => {
    console.log(`Incoming transaction: ${transaction.txHash}`);
    console.log(`Amount: ${transaction.amount.toString()} satoshis`);
    console.log(`From: ${transaction.from}`);
  }
);

// Stop monitoring
// unsubscribe();
```

#### 📊 Get Transaction History

```ts
// Get transaction history (for supported adapters)
if (bitcoinAdapter.getHistory) {
  const history = await bitcoinAdapter.getHistory({
    scope: "wallet",
    userId: "123e4567-e89b-12d3-a456-426614174000",
    chain: "bitcoin",
    index: "0"
  }, 50); // Last 50 transactions
  
  history.forEach(tx => {
    console.log(`${tx.direction}: ${tx.amount.toString()} at ${new Date(tx.timestamp)}`);
  });
}
```

#### 💸 Estimate Transaction Fees

```ts
// Estimate fees (for supported adapters) 
if (bitcoinAdapter.estimateFee) {
  const feeEstimate = await bitcoinAdapter.estimateFee({
    scope: "wallet",
    userId: "123e4567-e89b-12d3-a456-426614174000",
    chain: "bitcoin",
    index: "0"
  }, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", new Big('50000'));
  
  console.log(`Estimated fee: ${feeEstimate.totalFee.toString()} satoshis`);
}
```

#### 🌍 Multi-Chain Operations

```ts
// Work with multiple chains simultaneously
const ethereumAdapter = await registry.loadAdapter('ethereum');
const solanaAdapter = await registry.loadAdapter('solana');

const params = {
  scope: "trading",
  userId: "987fcdeb-51a2-43d1-b432-fedcba098765",
  index: "0"
};

// Derive addresses for multiple chains
const btcAddress = await bitcoinAdapter.deriveAddress({...params, chain: "bitcoin"});
const ethAddress = await ethereumAdapter.deriveAddress({...params, chain: "ethereum"});
const solAddress = await solanaAdapter.deriveAddress({...params, chain: "solana"});

console.log("Multi-chain addresses:", {
  bitcoin: btcAddress,
  ethereum: ethAddress, 
  solana: solAddress
});
```

## Running Tests

The SDK uses [Vitest](https://vitest.dev/) for testing. To run the tests:

```bash
bun run test
```

## 🏗️ Architecture

The SDK is built with a modular, enterprise-grade architecture:

### Core Components

- **`src/core/`**: Core infrastructure
  - **`AdapterRegistry.ts`**: Plugin system for managing chain adapters
  - **`adapters/BaseAdapter.ts`**: Abstract base class eliminating code duplication
  - **`errors/`**: Custom error system with retry logic and circuit breakers
  - **`events/EventBus.ts`**: Event-driven architecture for real-time monitoring
  - **`pool/ConnectionPool.ts`**: Connection pooling for resource management
  - **`config/ConfigManager.ts`**: Centralized configuration management

- **`src/adapters/`**: Chain-specific implementations
  - **`bitcoin/BitcoinAdapterV2.ts`**: Bitcoin with UTXO management
  - **`evm/EvmAdapterV2.ts`**: Ethereum and all EVM-compatible chains
  - **`aptos/AptosAdapterV2.ts`**: Aptos with fixed balance methods
  - **`ton/TonAdapter.ts`**: TON blockchain support
  - **`eos/EosAdapter.ts`**: EOS blockchain support  
  - **`near/NearAdapter.ts`**: NEAR Protocol support

- **`src/types/`**: Comprehensive TypeScript definitions
- **`src/utils/`**: Cryptographic utilities and key derivation
- **`src/__tests__/`**: 85+ comprehensive tests with mock adapters

### Plugin System

```ts
// Register custom adapters
registry.registerAdapter(CustomAdapterConstructor);

// Load external adapter packages
import { MyChainAdapters } from 'my-chain-package';
MyChainAdapters.forEach(adapter => registry.registerAdapter(adapter));
```

## 🌐 Supported Chains

The SDK supports 15+ major blockchains with comprehensive functionality:

### 🥇 Tier 1 - Full Support
|Chain|Derive|Balance|Send|History|Fee Estimation|Subscriptions|
|-----|------|-------|----|----|------------|-----------|
|**Bitcoin**|✅|✅|✅|✅|✅|✅|
|**Ethereum**|✅|✅|✅|✅|✅|✅|
|**Solana**|✅|✅|✅|✅|✅|✅|

### 🥈 Tier 2 - Core Support  
|Chain|Derive|Balance|Send|History|Fee Estimation|Subscriptions|
|-----|------|-------|----|----|------------|-----------|
|**Aptos**|✅|✅|✅|✅|✅|✅|
|**TON**|✅|✅|✅|✅|✅|✅|
|**EOS**|✅|✅|✅|✅|✅|✅|
|**NEAR**|✅|✅|✅|✅|✅|✅|

### 🥉 Tier 3 - EVM Ecosystem
All EVM-compatible chains share the same robust implementation:

|Chain|Derive|Balance|Send|History|Fee Estimation|Subscriptions|
|-----|------|-------|----|----|------------|-----------|
|**BSC** (Binance Smart Chain)|✅|✅|✅|✅|✅|✅|
|**Polygon**|✅|✅|✅|✅|✅|✅|
|**Avalanche** (C-Chain)|✅|✅|✅|✅|✅|✅|
|**Arbitrum**|✅|✅|✅|✅|✅|✅|
|**Optimism**|✅|✅|✅|✅|✅|✅|
|**Cronos**|✅|✅|✅|✅|✅|✅|
|**Sonic**|✅|✅|✅|✅|✅|✅|
|**Base**|✅|✅|✅|✅|✅|✅|

### 🔧 Legacy Support
|Chain|Derive|Balance|Send|Notes|
|-----|------|-------|----|----|
|**Cardano**|✅|✅|⚠️|Legacy adapter, limited functionality|
|**Polkadot**|✅|✅|⚠️|Legacy adapter, limited functionality|
|**Sui**|✅|✅|⚠️|Legacy adapter, limited functionality|
|**Tron**|✅|✅|⚠️|Legacy adapter, limited functionality|

> **Note**: Legacy adapters will be upgraded to the new BaseAdapter architecture in future releases.

## 🔧 Creating Custom Adapters

The SDK's plugin architecture makes it easy to add support for new blockchains:

### Method 1: Extend BaseAdapter (Recommended)

```ts
import { BaseAdapter } from 'drxa/core/adapters/BaseAdapter';
import { SupportedChain, ChainConfig } from 'drxa/types';
import Big from 'big.js';

class MyChainAdapter extends BaseAdapter {
  readonly chainName: SupportedChain = 'mychain';
  readonly config: ChainConfig = {
    name: 'MyChain',
    symbol: 'MYC',
    decimals: 8,
    category: 'other',
    endpoints: {
      http: { url: 'https://api.mychain.network' }
    }
  };

  // Implement required abstract methods
  protected async deriveAddressFromPrivateKey(privateKey: Uint8Array): Promise<string> {
    // Your chain-specific address derivation logic
    return 'mychain_address_here';
  }

  protected async getBalanceForAddress(address: string): Promise<Big> {
    // Your chain-specific balance fetching logic
    const response = await fetch(`${this.config.endpoints.http.url}/balance/${address}`);
    const data = await response.json();
    return new Big(data.balance);
  }

  protected async sendTransaction(
    privateKey: Uint8Array,
    from: string,
    to: string,
    amount: Big,
    config?: any
  ): Promise<{ txHash: string; status: string }> {
    // Your chain-specific transaction sending logic
    const signedTx = this.signTransaction(privateKey, {from, to, amount});
    const response = await fetch(`${this.config.endpoints.http.url}/broadcast`, {
      method: 'POST',
      body: JSON.stringify(signedTx)
    });
    const data = await response.json();
    return { txHash: data.hash, status: 'pending' };
  }

  // Optional: Override methods for enhanced functionality
  async estimateFee(params: any, to: string, amount: Big): Promise<FeeEstimate> {
    // Custom fee estimation logic
    return {
      baseFee: new Big('1000'),
      totalFee: new Big('1000'),
      gasLimit: new Big('21000'),
      gasPrice: new Big('1')
    };
  }
}
```

### Method 2: Register Your Adapter

```ts
import { AdapterRegistry } from 'drxa';

// Create adapter constructor for the registry
class MyChainAdapterConstructor {
  static readonly chainName = 'mychain';
  
  constructor(masterSeed: Uint8Array, config?: any, logger?: any, metrics?: any) {
    return new MyChainAdapter(masterSeed, config, logger, metrics);
  }
}

// Register with the SDK
const registry = AdapterRegistry.getInstance();
registry.registerAdapter(MyChainAdapterConstructor as any);

// Now you can use it
const myChainAdapter = await registry.loadAdapter('mychain');
```

### Method 3: External Package

Create a separate npm package for your adapters:

```ts
// my-chain-adapters/index.ts
export const MyChainAdapters = [
  MyChainAdapterConstructor,
  AnotherChainAdapterConstructor
];

export { MyChainAdapter };
```

```ts
// Usage in applications
import { MyChainAdapters } from 'my-chain-adapters';
import { AdapterRegistry } from 'drxa';

const registry = AdapterRegistry.getInstance();
MyChainAdapters.forEach(adapter => registry.registerAdapter(adapter));
```

### Benefits of BaseAdapter

✅ **Built-in error handling** with retry logic and circuit breakers  
✅ **Automatic subscription management** prevents memory leaks  
✅ **Parameter validation** with helpful error messages  
✅ **Event emission** for monitoring and debugging  
✅ **Connection pooling** for efficient resource usage  
✅ **Metrics collection** for performance monitoring  
✅ **Consistent API** across all chain implementations

## 🔍 Testing

The SDK includes a comprehensive test suite with 85+ tests:

```bash
# Run all tests
bun test

# Run specific adapter tests
bun test src/__tests__/adapters/bitcoin.test.ts
bun test src/__tests__/adapters/ethereum.test.ts
bun test src/__tests__/adapters/solana.test.ts

# Run tests with coverage
bun test --coverage
```

### Test Categories

- **Unit Tests**: Core functionality, error handling, validation
- **Integration Tests**: Real blockchain interactions (when configured)
- **Mock Tests**: Offline testing with realistic mock adapters
- **Performance Tests**: Address derivation speed and memory usage
- **Error Simulation**: Network failures, insufficient balance, invalid inputs

## 📊 Performance

The SDK is optimized for production use:

- **Address Derivation**: ~500 addresses/second per chain
- **Memory Usage**: <50MB for 10,000+ addresses with connection pooling
- **Error Recovery**: Automatic retry with exponential backoff
- **Connection Pooling**: Reuses HTTP connections for efficiency
- **Lazy Loading**: Adapters loaded only when needed

## 🛡️ Security

- **Deterministic**: Same seed always produces same addresses
- **No Key Storage**: Private keys derived on-demand and never stored
- **Type Safety**: Full TypeScript with runtime validation
- **Input Validation**: All parameters validated before use
- **Error Isolation**: Adapter failures don't affect other chains

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/drxa.git
cd drxa

# Install dependencies
bun install

# Run tests
bun test

# Build the project
bun run build

# Run examples
bun run examples/1_derive_address.ts
```

## 📄 License

This project is licensed under the GPL-V3 License. See the [LICENSE](LICENSE) file for details.
