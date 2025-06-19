/**
 * Examples demonstrating advanced transaction configuration options
 */

import { AdapterRegistry } from '../src/core/AdapterRegistry.js';
import { registerBuiltInAdapters } from '../src/adapters/index.js';
import { 
  BitcoinTransactionConfig, 
  EvmTransactionConfig, 
  SolanaTransactionConfig,
  AptosTransactionConfig
} from '../src/types/index.js';
import Big from 'big.js';

async function main() {
  // Initialize the SDK
  const masterSeed = new Uint8Array(32).fill(1); // Example seed
  const registry = AdapterRegistry.getInstance();
  registry.initialize(masterSeed);
  
  // Register built-in adapters
  registerBuiltInAdapters(registry);

  const deriveParams = {
    scope: "examples",
    userId: "123e4567-e89b-12d3-a456-426614174000",
    index: "0"
  };

  console.log("🚀 Advanced Transaction Configuration Examples\n");

  // ===== BITCOIN EXAMPLES =====
  console.log("📧 Bitcoin Transaction Examples:");
  
  try {
    const bitcoinAdapter = await registry.loadAdapter('bitcoin');
    const btcAddress = await bitcoinAdapter.deriveAddress({...deriveParams, chain: "bitcoin"});
    console.log(`Bitcoin Address: ${btcAddress}`);

    // Example 1: Custom fee rate with RBF enabled
    const btcConfig1: BitcoinTransactionConfig = {
      feeRate: new Big(25), // 25 sat/vbyte for faster confirmation
      rbf: true, // Enable Replace-by-Fee
      memo: "Payment for services",
      priority: 'high'
    };

    console.log("Example 1: High priority transaction with RBF");
    console.log("Config:", JSON.stringify({
      feeRate: btcConfig1.feeRate?.toString(),
      rbf: btcConfig1.rbf,
      priority: btcConfig1.priority
    }, null, 2));

    // Example 2: Manual UTXO selection
    const btcConfig2: BitcoinTransactionConfig = {
      utxoSelection: 'smallest-first', // Use smallest UTXOs first
      satPerVByte: new Big(10), // Economic fee rate
      lockTime: Math.floor(Date.now() / 1000) + 3600, // Lock for 1 hour
    };

    console.log("\nExample 2: UTXO strategy with time lock");
    console.log("Config:", JSON.stringify({
      utxoSelection: btcConfig2.utxoSelection,
      satPerVByte: btcConfig2.satPerVByte?.toString(),
      lockTime: btcConfig2.lockTime
    }, null, 2));

    // Example 3: Specific UTXO selection
    const btcConfig3: BitcoinTransactionConfig = {
      specificUtxos: ['abcd1234...', 'efgh5678...'], // Specific transaction IDs
      utxoSelection: 'manual',
      scriptType: 'p2tr', // Use Taproot
    };

    console.log("\nExample 3: Manual UTXO selection with Taproot");
    console.log("Config:", JSON.stringify({
      specificUtxos: btcConfig3.specificUtxos,
      utxoSelection: btcConfig3.utxoSelection,
      scriptType: btcConfig3.scriptType
    }, null, 2));

  } catch (error) {
    console.log(`Bitcoin adapter not available: ${error}`);
  }

  // ===== ETHEREUM EXAMPLES =====
  console.log("\n⚡ Ethereum Transaction Examples:");
  
  try {
    const ethAdapter = await registry.loadAdapter('ethereum');
    const ethAddress = await ethAdapter.deriveAddress({...deriveParams, chain: "ethereum"});
    console.log(`Ethereum Address: ${ethAddress}`);

    // Example 1: EIP-1559 transaction with custom fees
    const ethConfig1: EvmTransactionConfig = {
      type: 2, // EIP-1559 transaction
      maxFeePerGas: new Big('30000000000'), // 30 gwei max
      maxPriorityFeePerGas: new Big('2000000000'), // 2 gwei tip
      gasLimit: new Big('21000'),
      priority: 'high'
    };

    console.log("Example 1: EIP-1559 high priority transaction");
    console.log("Config:", JSON.stringify({
      type: ethConfig1.type,
      maxFeePerGas: ethConfig1.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: ethConfig1.maxPriorityFeePerGas?.toString(),
      gasLimit: ethConfig1.gasLimit?.toString()
    }, null, 2));

    // Example 2: Legacy transaction with custom nonce
    const ethConfig2: EvmTransactionConfig = {
      type: 0, // Legacy transaction
      gasPrice: new Big('20000000000'), // 20 gwei
      gasLimit: new Big('100000'), // Higher gas for contract interaction
      nonce: 42, // Custom nonce for transaction ordering
      data: '0xa9059cbb000000000000000000000000742d35cc6635c0532925a3b8d7389c8f0e7c1fd90000000000000000000000000000000000000000000000000de0b6b3a7640000' // ERC20 transfer
    };

    console.log("\nExample 2: Legacy transaction with contract call");
    console.log("Config:", JSON.stringify({
      type: ethConfig2.type,
      gasPrice: ethConfig2.gasPrice?.toString(),
      nonce: ethConfig2.nonce,
      data: ethConfig2.data
    }, null, 2));

    // Example 3: Cross-chain transaction
    const ethConfig3: EvmTransactionConfig = {
      chainId: 137, // Polygon
      gasPrice: new Big('30000000000'), // 30 gwei for Polygon
      gasLimit: new Big('21000'),
      memo: "Cross-chain transfer"
    };

    console.log("\nExample 3: Cross-chain to Polygon");
    console.log("Config:", JSON.stringify({
      chainId: ethConfig3.chainId,
      gasPrice: ethConfig3.gasPrice?.toString(),
      memo: ethConfig3.memo
    }, null, 2));

  } catch (error) {
    console.log(`Ethereum adapter not available: ${error}`);
  }

  // ===== SOLANA EXAMPLES =====
  console.log("\n☀️ Solana Transaction Examples:");
  
  try {
    // Note: These are examples of what would be possible with a SolanaAdapterV2
    const solanaConfig1: SolanaTransactionConfig = {
      computeUnits: 200000, // Custom compute units
      computeUnitPrice: new Big('1000'), // 1000 microlamports per CU
      preflightCommitment: 'confirmed',
      priority: 'urgent'
    };

    console.log("Example 1: High compute units with priority fee");
    console.log("Config:", JSON.stringify({
      computeUnits: solanaConfig1.computeUnits,
      computeUnitPrice: solanaConfig1.computeUnitPrice?.toString(),
      preflightCommitment: solanaConfig1.preflightCommitment
    }, null, 2));

    const solanaConfig2: SolanaTransactionConfig = {
      recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N', // Custom blockhash
      feePayer: 'FeePayer123...', // Different fee payer
      skipPreflight: true,
      maxRetries: 5
    };

    console.log("\nExample 2: Custom blockhash and fee payer");
    console.log("Config:", JSON.stringify({
      recentBlockhash: solanaConfig2.recentBlockhash,
      feePayer: solanaConfig2.feePayer,
      skipPreflight: solanaConfig2.skipPreflight
    }, null, 2));

  } catch (error) {
    console.log(`Solana examples (would work with SolanaAdapterV2)`);
  }

  // ===== APTOS EXAMPLES =====
  console.log("\n🎯 Aptos Transaction Examples:");
  
  try {
    const aptosAdapter = await registry.loadAdapter('aptos');
    const aptosAddress = await aptosAdapter.deriveAddress({...deriveParams, chain: "aptos"});
    console.log(`Aptos Address: ${aptosAddress}`);

    const aptosConfig1: AptosTransactionConfig = {
      gasUnitPrice: new Big('100'), // 100 octas per gas unit
      maxGasAmount: new Big('2000'), // Maximum gas to use
      expirationTimestampSecs: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      priority: 'normal'
    };

    console.log("Example 1: Custom gas configuration");
    console.log("Config:", JSON.stringify({
      gasUnitPrice: aptosConfig1.gasUnitPrice?.toString(),
      maxGasAmount: aptosConfig1.maxGasAmount?.toString(),
      expirationTimestampSecs: aptosConfig1.expirationTimestampSecs
    }, null, 2));

  } catch (error) {
    console.log(`Aptos adapter not available: ${error}`);
  }

  // ===== USAGE EXAMPLES =====
  console.log("\n💡 Usage Examples:");
  
  console.log(`
// Send Bitcoin with custom fee and RBF
await bitcoinAdapter.send(
  deriveParams,
  "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  new Big("50000"), // 0.0005 BTC
  {
    feeRate: new Big(15), // 15 sat/vbyte
    rbf: true,
    priority: 'high'
  }
);

// Send Ethereum with EIP-1559
await ethereumAdapter.send(
  deriveParams,
  "0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9",
  new Big("1000000000000000000"), // 1 ETH
  {
    type: 2,
    maxFeePerGas: new Big("20000000000"),
    maxPriorityFeePerGas: new Big("2000000000"),
    gasLimit: new Big("21000")
  }
);

// Send Aptos with custom gas
await aptosAdapter.send(
  deriveParams,
  "0x1234567890abcdef...",
  new Big("100000000"), // 1 APT
  {
    gasUnitPrice: new Big("100"),
    maxGasAmount: new Big("2000")
  }
);
  `);

  console.log("\n✅ Transaction configuration examples completed!");
}

// Run examples
main().catch(console.error);