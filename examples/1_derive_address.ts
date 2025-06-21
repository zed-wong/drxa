/**
 * Basic Address Derivation Example
 * 
 * This example demonstrates the basic usage of the drxa SDK for
 * deterministic address derivation across multiple blockchains.
 */

import { WalletSDK } from "../src/index.js";

// Basic example with minimal configuration
async function basicExample() {
  console.log('📝 Basic Address Derivation Example\n');
  
  const seed = "6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6";
  const sdk = new WalletSDK({ seed });
  const wallet = sdk.createWallet();

  // Derive a single address
  const ethAddress = await wallet.deriveAddress({
    scope: "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain: "ethereum",
    index: "0",
  });

  console.log("Ethereum Address:", ethAddress);
  
  return sdk;
}

// Enhanced example with error handling and events
async function enhancedExample() {
  console.log('\n📝 Enhanced Example with Events and Error Handling\n');
  
  const seed = "6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6";
  
  // Initialize with custom logger and event monitoring
  const sdk = new WalletSDK({ 
    seed,
    logger: {
      info: (msg, ctx) => console.log(`ℹ️  ${msg}`, ctx ? JSON.stringify(ctx) : ''),
      warn: (msg, ctx) => console.warn(`⚠️  ${msg}`, ctx ? JSON.stringify(ctx) : ''),
      error: (msg, err, ctx) => console.error(`❌ ${msg}:`, err?.message, ctx ? JSON.stringify(ctx) : ''),
      debug: (msg, ctx) => { /* silent in this example */ }
    }
  });
  
  // Subscribe to events
  const subscription = sdk.onEvent((event) => {
    console.log(`📡 Event: ${event.type} on ${event.chain}`);
  });
  
  const wallet = sdk.createWallet();
  
  // Derive addresses for multiple chains
  const chains = ['ethereum', 'bitcoin', 'solana'] as const;
  const userParams = {
    scope: "demo",
    userId: "demo-user-123",
    index: "0"
  };
  
  console.log('Deriving addresses for multiple chains...\n');
  
  for (const chain of chains) {
    try {
      const address = await wallet.deriveAddress({
        ...userParams,
        chain
      });
      
      console.log(`${chain.padEnd(10)}: ${address}`);
    } catch (error) {
      console.error(`Failed to derive ${chain} address:`, error.message);
    }
  }
  
  // Cleanup
  subscription.unsubscribe();
  return sdk;
}

// Multi-user example
async function multiUserExample() {
  console.log('\n📝 Multi-User Address Derivation Example\n');
  
  const seed = "6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6";
  const sdk = new WalletSDK({ seed });
  const wallet = sdk.createWallet();
  
  // Different users and scopes
  const scenarios = [
    { scope: "wallet", userId: "alice-001", chain: "ethereum" as const, description: "Alice's main wallet" },
    { scope: "wallet", userId: "bob-002", chain: "bitcoin" as const, description: "Bob's main wallet" },
    { scope: "trading", userId: "alice-001", chain: "ethereum" as const, description: "Alice's trading account" },
    { scope: "savings", userId: "alice-001", chain: "bitcoin" as const, description: "Alice's savings account" },
    { scope: "session", userId: "temp-user", chain: "solana" as const, description: "Temporary session address" }
  ];
  
  console.log('Generating addresses for different users and use cases...\n');
  
  for (const scenario of scenarios) {
    try {
      const address = await wallet.deriveAddress({
        ...scenario,
        index: "0"
      });
      
      console.log(`${scenario.description}:`);
      console.log(`  Address: ${address}`);
      console.log(`  Chain: ${scenario.chain}`);
      console.log(`  Scope: ${scenario.scope}`);
      console.log(`  User: ${scenario.userId}\n`);
    } catch (error) {
      console.error(`Failed for ${scenario.description}:`, error.message);
    }
  }
  
  return sdk;
}

// Address sequence example
async function addressSequenceExample() {
  console.log('\n📝 Address Sequence Example\n');
  
  const seed = "6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6";
  const sdk = new WalletSDK({ seed });
  const wallet = sdk.createWallet();
  
  const baseParams = {
    scope: "sequence-demo",
    userId: "sequence-user",
    chain: "ethereum" as const
  };
  
  console.log('Generating address sequence for user...\n');
  
  // Generate 5 sequential addresses
  for (let i = 0; i < 5; i++) {
    const address = await wallet.deriveAddress({
      ...baseParams,
      index: i.toString()
    });
    
    console.log(`Address ${i}: ${address}`);
  }
  
  console.log('\nNote: These addresses are deterministic - running this again');
  console.log('      with the same seed will generate identical addresses.');
  
  return sdk;
}

// Main function
async function main() {
  console.log('🚀 drxa SDK Address Derivation Examples');
  console.log('========================================\n');
  
  try {
    // Run all examples
    let sdk = await basicExample();
    await sdk.shutdown();
    
    sdk = await enhancedExample();
    await sdk.shutdown();
    
    sdk = await multiUserExample();
    await sdk.shutdown();
    
    sdk = await addressSequenceExample();
    await sdk.shutdown();
    
    console.log('\n✅ All examples completed successfully!');
    console.log('\nNext steps:');
    console.log('- Try examples/advanced_sdk_usage.ts for more features');
    console.log('- Check examples/event_driven_monitoring.ts for real-time monitoring');
    console.log('- Explore examples/error_handling_retry.ts for robust error handling');
    
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

main();