# drxa SDK Examples

This directory contains comprehensive examples demonstrating all features of the drxa multi-chain address SDK. The examples are organized to showcase both basic usage and advanced enterprise features.

## 📚 Table of Contents

- [Quick Start](#quick-start)
- [Basic Examples](#basic-examples)
- [Advanced Examples](#advanced-examples)
- [Chain-Specific Examples](#chain-specific-examples)
- [Enterprise Examples](#enterprise-examples)
- [Running Examples](#running-examples)

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Run the basic example:**
   ```bash
   bun run examples/1_derive_address.ts
   ```

3. **Explore advanced features:**
   ```bash
   bun run examples/advanced_sdk_usage.ts
   ```

## 📝 Basic Examples

### [`0_create_ed25519_priv.ts`](0_create_ed25519_priv.ts)
**Generate Ed25519 Private Keys**
- Create new ed25519 private keys
- Generate seeds for SDK initialization
- Key format conversions (hex, PEM)

```bash
bun run examples/0_create_ed25519_priv.ts
```

### [`1_derive_address.ts`](1_derive_address.ts) ⭐ **Updated**
**Basic Address Derivation**
- Simple address derivation
- Multi-chain support
- Multi-user scenarios
- Event handling basics
- Error handling

```bash
bun run examples/1_derive_address.ts
```

### [`3_multiple_addresses.ts`](3_multiple_addresses.ts)
**Multiple Address Management**
- Batch address derivation
- Address sequences
- Different scopes and use cases

```bash
bun run examples/3_multiple_addresses.ts
```

## 🔥 Advanced Examples

### [`advanced_sdk_usage.ts`](advanced_sdk_usage.ts) ⭐ **New**
**Enterprise SDK Features**
- Custom logger implementation
- Metrics collection and reporting
- Environment-based configuration
- Adapter preloading for performance
- Batch operations
- Connection pool monitoring
- Configuration overrides

```bash
bun run examples/advanced_sdk_usage.ts
```

**Features Demonstrated:**
- ✅ Custom Logger with log aggregation
- ✅ Metrics Collector with performance reports
- ✅ Environment-based configuration (dev/prod)
- ✅ Adapter preloading for 3x faster startup
- ✅ Batch balance operations
- ✅ Connection pool monitoring
- ✅ Configuration overrides per operation
- ✅ Graceful shutdown

### [`event_driven_monitoring.ts`](event_driven_monitoring.ts) ⭐ **New**
**Real-time Event System**
- Global event monitoring
- Chain-specific event filtering
- Error event handling
- Transaction monitoring
- Event history management
- Custom event handlers with business logic

```bash
bun run examples/event_driven_monitoring.ts
```

**Features Demonstrated:**
- ✅ Real-time transaction monitoring
- ✅ Filtered event subscriptions
- ✅ Event history and analytics
- ✅ Custom business logic handlers
- ✅ Multi-address monitoring
- ✅ Proper cleanup and unsubscription

### [`error_handling_retry.ts`](error_handling_retry.ts) ⭐ **New**
**Robust Error Handling**
- Custom error types and codes
- Automatic retry with exponential backoff
- Circuit breaker patterns
- Error recovery strategies
- Error monitoring and analytics

```bash
bun run examples/error_handling_retry.ts
```

**Features Demonstrated:**
- ✅ DrxaError types and error codes
- ✅ Automatic retry with configurable backoff
- ✅ Circuit breaker for API protection
- ✅ Custom error recovery strategies
- ✅ Error event monitoring
- ✅ Fallback mechanisms

### [`plugin_architecture.ts`](plugin_architecture.ts) ⭐ **New**
**Extensible Plugin System**
- Create custom chain adapters
- Extend BaseAdapter for reduced boilerplate
- Plugin packages and registration
- Multi-chain wrapper adapters
- Business-specific adapters (trading, etc.)

```bash
bun run examples/plugin_architecture.ts
```

**Features Demonstrated:**
- ✅ Custom chain adapter creation
- ✅ BaseAdapter extension patterns
- ✅ Plugin package registration
- ✅ Advanced adapter with business logic
- ✅ Multi-chain wrapper adapters
- ✅ Trading-specific functionality

## 🔗 Chain-Specific Examples

### [`2_adapters/`](2_adapters/) Directory

Each adapter example demonstrates chain-specific features:

| File | Chain | Features |
|------|-------|----------|
| [`bitcoin_example.ts`](2_adapters/bitcoin_example.ts) | Bitcoin | UTXO management, fee estimation |
| [`evm_example.ts`](2_adapters/evm_example.ts) | Ethereum + EVM | ERC20 tokens, gas estimation, EIP-1559 |
| [`solana_example.ts`](2_adapters/solana_example.ts) | Solana | SPL tokens, compute units |
| [`aptos_example.ts`](2_adapters/aptos_example.ts) | Aptos | Move resources, gas estimation |
| [`tron_example.ts`](2_adapters/tron_example.ts) | Tron | TRX and TRC20 tokens |
| [`sui_example.ts`](2_adapters/sui_example.ts) | Sui | Object-based transactions |
| [`polkadot_example.ts`](2_adapters/polkadot_example.ts) | Polkadot | Substrate framework |
| [`cardano_example.ts`](2_adapters/cardano_example.ts) | Cardano | UTXO extended model |

### Running Chain Examples

```bash
# Bitcoin operations
bun run examples/2_adapters/bitcoin_example.ts

# Ethereum and EVM chains
bun run examples/2_adapters/evm_example.ts

# Solana operations
bun run examples/2_adapters/solana_example.ts
```

## 🏢 Enterprise Examples

### [`transaction_config_examples.ts`](transaction_config_examples.ts)
**Advanced Transaction Configuration**
- Custom fee strategies
- Priority levels
- Gas optimization
- Transaction metadata

```bash
bun run examples/transaction_config_examples.ts
```

### [`advanced_transactions.ts`](advanced_transactions.ts)
**Complex Transaction Patterns**
- Multi-step transactions
- Conditional transactions
- Batch processing
- Cross-chain coordination

```bash
bun run examples/advanced_transactions.ts
```

## 🛠️ Running Examples

### Prerequisites
```bash
# Install dependencies
bun install

# Build the SDK (if needed)
bun run build
```

### Running Individual Examples
```bash
# Basic examples
bun run examples/1_derive_address.ts
bun run examples/advanced_sdk_usage.ts

# Chain-specific examples
bun run examples/2_adapters/bitcoin_example.ts
bun run examples/2_adapters/evm_example.ts

# Advanced features
bun run examples/event_driven_monitoring.ts
bun run examples/error_handling_retry.ts
bun run examples/plugin_architecture.ts
```

### Running All Examples
```bash
# Run all basic examples
for file in examples/*.ts; do
  echo "Running $file..."
  bun run "$file"
done

# Run all adapter examples  
for file in examples/2_adapters/*.ts; do
  echo "Running $file..."
  bun run "$file"
done
```

## 📊 Example Categories

### 🟢 Beginner Level
- `0_create_ed25519_priv.ts` - Key generation
- `1_derive_address.ts` - Basic address derivation
- `3_multiple_addresses.ts` - Multiple addresses

### 🟡 Intermediate Level
- `2_adapters/*_example.ts` - Chain-specific operations
- `transaction_config_examples.ts` - Transaction configuration
- `advanced_transactions.ts` - Complex transactions

### 🔴 Advanced Level
- `advanced_sdk_usage.ts` - Enterprise features
- `event_driven_monitoring.ts` - Real-time monitoring
- `error_handling_retry.ts` - Robust error handling
- `plugin_architecture.ts` - Custom adapters

## 🎯 Learning Path

### 1. **Start Here** (5 minutes)
```bash
bun run examples/1_derive_address.ts
```

### 2. **Explore Chains** (15 minutes)
```bash
bun run examples/2_adapters/bitcoin_example.ts
bun run examples/2_adapters/evm_example.ts
bun run examples/2_adapters/solana_example.ts
```

### 3. **Advanced Features** (30 minutes)
```bash
bun run examples/advanced_sdk_usage.ts
bun run examples/event_driven_monitoring.ts
bun run examples/error_handling_retry.ts
```

### 4. **Build Custom Adapters** (45 minutes)
```bash
bun run examples/plugin_architecture.ts
```

## 🔍 Code Patterns

### Basic SDK Initialization
```typescript
import { WalletSDK } from '../src/index.js';

const sdk = new WalletSDK({ 
  seed: 'your-32-byte-hex-seed' 
});
const wallet = sdk.createWallet();
```

### Advanced SDK Initialization
```typescript
import { WalletSDK } from '../src/index.js';

const sdk = new WalletSDK({
  seed: 'your-seed',
  logger: customLogger,
  metrics: customMetrics,
  environment: 'production',
  defaultConfig: {
    maxRetries: 5,
    timeout: 60000
  }
});
```

### Address Derivation Pattern
```typescript
const address = await wallet.deriveAddress({
  scope: 'wallet',      // Usage context
  userId: 'user-uuid',  // Unique identifier
  chain: 'ethereum',    // Blockchain
  index: '0'           // Address index
});
```

### Event Monitoring Pattern
```typescript
const unsubscribe = sdk.onEvent((event) => {
  console.log(`Event: ${event.type} on ${event.chain}`);
});

// Later: unsubscribe();
```

### Error Handling Pattern
```typescript
try {
  const result = await wallet.send(params, to, amount);
} catch (error) {
  if (error instanceof DrxaError) {
    if (error.isRetryable) {
      // Automatic retry will handle this
    } else {
      // Handle non-retryable error
    }
  }
}
```

## 🆘 Common Issues

### Build Errors
```bash
# Clean and rebuild
bun run clean
bun run build
```

### Import Errors
Make sure you're using `.js` extensions in imports:
```typescript
import { WalletSDK } from '../src/index.js';  // ✅ Correct
import { WalletSDK } from '../src/index';     // ❌ Will fail
```

### Network Timeouts
Increase timeouts for slow operations:
```typescript
const sdk = new WalletSDK({
  seed,
  defaultConfig: { timeout: 60000 } // 60 seconds
});
```

## 📚 Additional Resources

- [Main README](../README.md) - Full SDK documentation
- [CLAUDE.md](../CLAUDE.md) - Architecture details
- [API Documentation](../docs/) - Detailed API reference
- [Tests](../src/__tests__/) - Unit and integration tests

## 🤝 Contributing Examples

To add a new example:

1. **Create the example file:**
   ```typescript
   /**
    * Your Example Title
    * 
    * Description of what this example demonstrates.
    */
   
   import { WalletSDK } from '../src/index.js';
   
   // Your example code here
   ```

2. **Add to this README** in the appropriate section

3. **Test the example:**
   ```bash
   bun run examples/your_example.ts
   ```

4. **Submit a pull request**

## 📄 License

All examples are provided under the same GPL-V3 license as the main SDK.