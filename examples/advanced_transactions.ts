/**
 * Advanced Transaction Examples - Demonstrating gas, fee, and configuration options
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
  console.log('🚀 Advanced Transaction Configuration Demo\n');

  // Initialize the SDK
  const masterSeed = new Uint8Array(32).fill(1); // Example seed
  const registry = AdapterRegistry.getInstance();
  registry.initialize(masterSeed);
  
  // Register built-in adapters
  registerBuiltInAdapters(registry);

  const deriveParams = {
    scope: "demo",
    userId: "demo-user-12345",
    index: "0"
  };

  // ===== BITCOIN: Advanced Fee and UTXO Management =====
  console.log('💰 Bitcoin - Custom Fee Rates and UTXO Selection');
  try {
    const bitcoinAdapter = await registry.loadAdapter('bitcoin');
    const btcAddress = await bitcoinAdapter.deriveAddress({...deriveParams, chain: "bitcoin"});
    console.log(`Bitcoin Address: ${btcAddress}`);

    // High priority transaction with RBF
    const btcConfig1: BitcoinTransactionConfig = {
      feeRate: new Big(50), // 50 sat/vbyte for fast confirmation
      rbf: true, // Enable Replace-by-Fee
      utxoSelection: 'largest-first',
      priority: 'urgent',
      memo: 'Urgent payment - high fee'
    };

    console.log('\n📤 Sending high-priority Bitcoin transaction:');
    console.log(`Fee Rate: ${btcConfig1.feeRate?.toString()} sat/vbyte`);
    console.log(`RBF Enabled: ${btcConfig1.rbf}`);
    console.log(`UTXO Strategy: ${btcConfig1.utxoSelection}`);

    // Note: This would fail in real usage without actual UTXOs
    // const btcResult = await bitcoinAdapter.send(
    //   {...deriveParams, chain: "bitcoin"},
    //   "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    //   new Big("50000"), // 0.0005 BTC
    //   btcConfig1
    // );

    // Economic transaction
    const btcConfig2: BitcoinTransactionConfig = {
      satPerVByte: new Big(5), // Low fee for non-urgent transaction
      utxoSelection: 'smallest-first', // Use small UTXOs to consolidate
      lockTime: Math.floor(Date.now() / 1000) + 3600, // Lock for 1 hour
      memo: 'Consolidation transaction'
    };

    console.log('\n📤 Economic Bitcoin transaction:');
    console.log(`Fee Rate: ${btcConfig2.satPerVByte?.toString()} sat/vbyte`);
    console.log(`UTXO Strategy: ${btcConfig2.utxoSelection}`);
    console.log(`Lock Time: ${btcConfig2.lockTime} (1 hour from now)`);

  } catch (error) {
    console.log(`Bitcoin demo skipped: ${error}`);
  }

  // ===== ETHEREUM: EIP-1559 and Contract Interactions =====
  console.log('\n⚡ Ethereum - EIP-1559 and Smart Contracts');
  try {
    const ethAdapter = await registry.loadAdapter('ethereum');
    const ethAddress = await ethAdapter.deriveAddress({...deriveParams, chain: "ethereum"});
    console.log(`Ethereum Address: ${ethAddress}`);

    // EIP-1559 transaction with custom fees
    const ethConfig1: EvmTransactionConfig = {
      type: 2, // EIP-1559
      maxFeePerGas: new Big('100000000000'), // 100 gwei max
      maxPriorityFeePerGas: new Big('5000000000'), // 5 gwei tip
      gasLimit: new Big('21000'),
      priority: 'high',
      memo: 'EIP-1559 high priority transfer'
    };

    console.log('\n📤 EIP-1559 Ethereum transaction:');
    console.log(`Max Fee: ${ethConfig1.maxFeePerGas?.div(1e9).toString()} gwei`);
    console.log(`Priority Fee: ${ethConfig1.maxPriorityFeePerGas?.div(1e9).toString()} gwei`);
    console.log(`Gas Limit: ${ethConfig1.gasLimit?.toString()}`);

    // Smart contract interaction (ERC20 transfer)
    const ethConfig2: EvmTransactionConfig = {
      type: 2,
      gasLimit: new Big('65000'), // Higher gas for contract interaction
      maxFeePerGas: new Big('50000000000'), // 50 gwei
      maxPriorityFeePerGas: new Big('2000000000'), // 2 gwei
      data: '0xa9059cbb000000000000000000000000742d35cc6635c0532925a3b8d7389c8f0e7c1fd90000000000000000000000000000000000000000000000000de0b6b3a7640000', // ERC20 transfer
      value: new Big('0'), // No ETH sent, just gas fees
      memo: 'ERC20 token transfer'
    };

    console.log('\n📤 Smart Contract interaction:');
    console.log(`Contract Data: ${ethConfig2.data?.substring(0, 20)}...`);
    console.log(`Gas Limit: ${ethConfig2.gasLimit?.toString()}`);
    console.log(`ETH Value: ${ethConfig2.value?.toString()}`);

    // Custom nonce for transaction ordering
    const ethConfig3: EvmTransactionConfig = {
      type: 0, // Legacy transaction
      gasPrice: new Big('30000000000'), // 30 gwei
      gasLimit: new Big('21000'),
      nonce: 123, // Custom nonce
      chainId: 1, // Mainnet
      memo: 'Ordered transaction with custom nonce'
    };

    console.log('\n📤 Legacy transaction with custom nonce:');
    console.log(`Gas Price: ${ethConfig3.gasPrice?.div(1e9).toString()} gwei`);
    console.log(`Custom Nonce: ${ethConfig3.nonce}`);
    console.log(`Chain ID: ${ethConfig3.chainId}`);

  } catch (error) {
    console.log(`Ethereum demo skipped: ${error}`);
  }

  // ===== SOLANA: Compute Units and Priority Fees =====
  console.log('\n☀️ Solana - Compute Units and Priority Fees');
  
  // Note: These examples show the configuration that would be used with SolanaAdapterV2
  const solanaConfig1: SolanaTransactionConfig = {
    computeUnits: 400000, // High compute units for complex transaction
    computeUnitPrice: new Big('5000'), // 5000 microlamports per CU
    preflightCommitment: 'confirmed',
    priority: 'urgent',
    memo: 'High-compute Solana transaction'
  };

  console.log('\n📤 High-compute Solana transaction (example):');
  console.log(`Compute Units: ${solanaConfig1.computeUnits?.toLocaleString()}`);
  console.log(`Price per CU: ${solanaConfig1.computeUnitPrice?.toString()} microlamports`);
  console.log(`Commitment Level: ${solanaConfig1.preflightCommitment}`);

  const solanaConfig2: SolanaTransactionConfig = {
    skipPreflight: true, // Skip simulation for faster execution
    maxRetries: 10, // More retries for network congestion
    recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
    memo: 'Fast execution with custom blockhash'
  };

  console.log('\n📤 Fast Solana transaction (example):');
  console.log(`Skip Preflight: ${solanaConfig2.skipPreflight}`);
  console.log(`Max Retries: ${solanaConfig2.maxRetries}`);
  console.log(`Custom Blockhash: ${solanaConfig2.recentBlockhash?.substring(0, 10)}...`);

  // ===== APTOS: Gas Configuration =====
  console.log('\n🎯 Aptos - Gas Unit Configuration');
  try {
    const aptosAdapter = await registry.loadAdapter('aptos');
    const aptosAddress = await aptosAdapter.deriveAddress({...deriveParams, chain: "aptos"});
    console.log(`Aptos Address: ${aptosAddress}`);

    const aptosConfig: AptosTransactionConfig = {
      gasUnitPrice: new Big('150'), // 150 octas per gas unit
      maxGasAmount: new Big('5000'), // Maximum 5000 gas units
      expirationTimestampSecs: Math.floor(Date.now() / 1000) + 600, // 10 minutes
      priority: 'normal',
      memo: 'Aptos transfer with custom gas'
    };

    console.log('\n📤 Aptos transaction:');
    console.log(`Gas Unit Price: ${aptosConfig.gasUnitPrice?.toString()} octas`);
    console.log(`Max Gas Amount: ${aptosConfig.maxGasAmount?.toString()}`);
    console.log(`Expires in: 10 minutes`);

    // Note: Actual send would work like this:
    // const aptosResult = await aptosAdapter.send(
    //   {...deriveParams, chain: "aptos"},
    //   "0x742d35cc6635c0532925a3b8d7389c8f0e7c1fd9",
    //   new Big("100000000"), // 1 APT
    //   aptosConfig
    // );

  } catch (error) {
    console.log(`Aptos demo skipped: ${error}`);
  }

  // ===== PRIORITY EXAMPLES =====
  console.log('\n🔥 Priority-Based Fee Examples');
  
  const priorities = [
    { level: 'low', description: 'Economic rate for non-urgent transactions' },
    { level: 'normal', description: 'Standard rate for regular transactions' },
    { level: 'high', description: 'Faster confirmation for important transactions' },
    { level: 'urgent', description: 'Maximum fee for critical transactions' }
  ] as const;

  priorities.forEach(({ level, description }) => {
    console.log(`\n📊 ${level.toUpperCase()} Priority:`);
    console.log(`   Description: ${description}`);
    
    // Example Bitcoin fees for each priority
    const btcFees = {
      low: '5',
      normal: '10', 
      high: '25',
      urgent: '50'
    };
    
    // Example Ethereum fees for each priority  
    const ethFees = {
      low: '15',
      normal: '25',
      high: '50', 
      urgent: '100'
    };

    console.log(`   Bitcoin: ~${btcFees[level]} sat/vbyte`);
    console.log(`   Ethereum: ~${ethFees[level]} gwei`);
  });

  // ===== USAGE PATTERNS =====
  console.log('\n💡 Common Usage Patterns');
  
  console.log(`
🔹 Fast Bitcoin Payment:
  feeRate: new Big(30),    // 30 sat/vbyte
  rbf: true,               // Allow fee bumping
  priority: 'high'

🔹 Economic Bitcoin Consolidation:
  satPerVByte: new Big(5), // 5 sat/vbyte
  utxoSelection: 'smallest-first',
  priority: 'low'

🔹 Ethereum DeFi Transaction:
  type: 2,                           // EIP-1559
  maxFeePerGas: new Big('80000000000'),      // 80 gwei
  maxPriorityFeePerGas: new Big('3000000000'), // 3 gwei tip
  gasLimit: new Big('300000')        // DeFi needs more gas

🔹 Ethereum MEV-Resistant:
  type: 2,
  maxFeePerGas: new Big('200000000000'),     // 200 gwei max
  maxPriorityFeePerGas: new Big('50000000000'), // 50 gwei tip
  priority: 'urgent'

🔹 Solana DeFi Arbitrage:
  computeUnits: 1000000,    // 1M CU for complex operations
  computeUnitPrice: new Big('10000'), // High priority fee
  skipPreflight: true,      // Speed over safety
  maxRetries: 15

🔹 Aptos Smart Contract:
  gasUnitPrice: new Big('200'),  // Higher gas price
  maxGasAmount: new Big('10000'), // More gas for contracts
  priority: 'high'
  `);

  console.log('✅ Advanced transaction configuration demo completed!');
  console.log('\n📚 Next Steps:');
  console.log('- Integrate these patterns into your application');
  console.log('- Monitor transaction confirmation times');
  console.log('- Adjust fees based on network conditions');
  console.log('- Use priority levels for automatic fee selection');
}

// Run demo
main().catch(console.error);