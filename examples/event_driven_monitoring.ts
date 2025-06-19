/**
 * Event-Driven Monitoring Example
 * 
 * This example demonstrates the SDK's event-driven architecture for
 * real-time transaction monitoring across multiple blockchains.
 */

import { WalletSDK } from '../src/index.js';
import { 
  ChainEvent, 
  TransactionEvent, 
  ErrorEvent,
  ConnectionEvent 
} from '../src/types/index.js';

// Initialize SDK with event monitoring
const seed = '6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6';
const sdk = new WalletSDK({ 
  seed,
  environment: 'development'
});

// Example 1: Monitor all events across all chains
console.log('🔔 Starting global event monitoring...\n');

const unsubscribeGlobal = sdk.onEvent((event: ChainEvent) => {
  console.log(`[${new Date().toISOString()}] Event received:`);
  console.log(`  Type: ${event.type}`);
  console.log(`  Chain: ${event.chain}`);
  
  switch (event.type) {
    case 'transaction':
      const txEvent = event as TransactionEvent;
      console.log(`  Transaction: ${txEvent.data.txHash}`);
      console.log(`  Amount: ${txEvent.data.amount.toString()}`);
      console.log(`  Status: ${txEvent.data.status}`);
      break;
      
    case 'error':
      const errorEvent = event as ErrorEvent;
      console.log(`  Error: ${errorEvent.data.message}`);
      console.log(`  Code: ${errorEvent.data.code}`);
      break;
      
    case 'connection':
      const connEvent = event as ConnectionEvent;
      console.log(`  Connection: ${connEvent.data.status}`);
      console.log(`  Endpoint: ${connEvent.data.endpoint}`);
      break;
  }
  console.log('');
});

// Example 2: Filter events by chain
const unsubscribeBitcoin = sdk.onEvent(
  (event: ChainEvent) => {
    if (event.type === 'transaction') {
      const tx = event as TransactionEvent;
      console.log(`💰 Bitcoin transaction: ${tx.data.txHash}`);
    }
  },
  { chain: 'bitcoin' }
);

// Example 3: Filter events by type
const unsubscribeErrors = sdk.onEvent(
  (event: ChainEvent) => {
    const error = event as ErrorEvent;
    console.error(`❌ Error on ${event.chain}: ${error.data.message}`);
    
    // You could send this to your monitoring service
    // sendToSentry(error);
  },
  { type: 'error' }
);

// Example 4: Monitor specific addresses with subscriptions
async function monitorAddresses() {
  const wallet = sdk.createWallet();
  
  // Derive addresses for monitoring
  const params = {
    scope: 'wallet',
    userId: '123e4567-e89b-12d3-a456-426614174000',
    index: '0'
  };
  
  // Monitor Bitcoin address
  const btcAddress = await wallet.deriveAddress({ ...params, chain: 'bitcoin' });
  console.log(`Monitoring Bitcoin address: ${btcAddress}`);
  
  const unsubscribeBtc = await wallet.subscribe(
    { ...params, chain: 'bitcoin' },
    (tx) => {
      console.log(`\n📥 Incoming Bitcoin transaction!`);
      console.log(`   From: ${tx.from}`);
      console.log(`   Amount: ${tx.amount.toString()} satoshis`);
      console.log(`   Hash: ${tx.txHash}`);
      console.log(`   Time: ${new Date(tx.timestamp || Date.now()).toLocaleString()}`);
    }
  );
  
  // Monitor Ethereum address
  const ethAddress = await wallet.deriveAddress({ ...params, chain: 'ethereum' });
  console.log(`Monitoring Ethereum address: ${ethAddress}`);
  
  const unsubscribeEth = await wallet.subscribe(
    { ...params, chain: 'ethereum' },
    (tx) => {
      console.log(`\n📥 Incoming Ethereum transaction!`);
      console.log(`   From: ${tx.from}`);
      console.log(`   Amount: ${tx.amount.toString()} wei`);
      console.log(`   Hash: ${tx.txHash}`);
    }
  );
  
  // Return cleanup function
  return () => {
    unsubscribeBtc();
    unsubscribeEth();
  };
}

// Example 5: Event history and filtering
console.log('\n📊 Event History Example:');

// Get recent events
const recentEvents = sdk.getEventHistory(10);
console.log(`Found ${recentEvents.length} recent events`);

// Filter events by timestamp
const lastHour = Date.now() - 60 * 60 * 1000;
const recentTransactions = sdk.getEventHistory(100)
  .filter(event => 
    event.type === 'transaction' && 
    event.timestamp >= lastHour
  );

console.log(`${recentTransactions.length} transactions in the last hour`);

// Example 6: Custom event handlers with business logic
class TransactionMonitor {
  private thresholds = {
    bitcoin: 100000000,    // 1 BTC in satoshis
    ethereum: 1000000000000000000n  // 1 ETH in wei
  };
  
  constructor(private sdk: WalletSDK) {
    this.setupMonitoring();
  }
  
  private setupMonitoring() {
    this.sdk.onEvent((event: ChainEvent) => {
      if (event.type === 'transaction') {
        this.handleTransaction(event as TransactionEvent);
      }
    });
  }
  
  private handleTransaction(event: TransactionEvent) {
    const { chain, data } = event;
    const threshold = this.thresholds[chain as keyof typeof this.thresholds];
    
    if (threshold && data.amount.gt(threshold.toString())) {
      console.log(`\n🚨 LARGE TRANSACTION ALERT!`);
      console.log(`   Chain: ${chain}`);
      console.log(`   Amount: ${data.amount.toString()}`);
      console.log(`   Transaction: ${data.txHash}`);
      
      // Send notification
      this.sendNotification(event);
    }
  }
  
  private sendNotification(event: TransactionEvent) {
    // In production, send to Discord, Telegram, email, etc.
    console.log('   📧 Notification sent!');
  }
}

// Run the examples
async function main() {
  console.log('SDK Event Monitoring Examples\n');
  console.log('This example demonstrates real-time event monitoring.');
  console.log('Events will be logged as they occur.\n');
  
  // Start address monitoring
  const cleanupAddresses = await monitorAddresses();
  
  // Start transaction monitor
  const monitor = new TransactionMonitor(sdk);
  
  // Simulate some activity (in production, these would be real events)
  console.log('\n⏳ Monitoring for events... Press Ctrl+C to exit\n');
  
  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping event monitoring...');
    
    // Unsubscribe from all events
    unsubscribeGlobal();
    unsubscribeBitcoin();
    unsubscribeErrors();
    cleanupAddresses();
    
    // Graceful shutdown
    sdk.shutdown().then(() => {
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
  });
}

main().catch(console.error);