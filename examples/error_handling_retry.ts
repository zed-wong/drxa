/**
 * Error Handling and Retry Logic Example
 * 
 * This example demonstrates the SDK's robust error handling system
 * with automatic retry logic, circuit breakers, and error recovery.
 */

import { WalletSDK } from '../src/index.js';
import { 
  DrxaError, 
  ErrorCode,
  withRetry,
  withCircuitBreaker,
  ExponentialBackoff
} from '../src/core/errors/index.js';
import Big from 'big.js';

const seed = '6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6';

// Initialize SDK with custom error handling configuration
const sdk = new WalletSDK({ 
  seed,
  defaultConfig: {
    maxRetries: 5,
    timeout: 30000,
    retryDelay: 1000,
    retryBackoff: 'exponential'
  },
  logger: {
    info: (msg, ctx) => console.log(`ℹ️  ${msg}`, ctx || ''),
    warn: (msg, ctx) => console.warn(`⚠️  ${msg}`, ctx || ''),
    error: (msg, err, ctx) => console.error(`❌ ${msg}`, err.message, ctx || ''),
    debug: (msg, ctx) => console.debug(`🔍 ${msg}`, ctx || '')
  }
});

const wallet = sdk.createWallet();

// Example 1: Basic Error Handling
async function basicErrorHandling() {
  console.log('\n📚 Example 1: Basic Error Handling\n');
  
  try {
    // Attempt to send with insufficient balance
    const result = await wallet.send(
      {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'bitcoin',
        index: '0'
      },
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      new Big('1000000000') // 10 BTC (likely insufficient)
    );
    
    console.log('Transaction sent:', result.txHash);
  } catch (error) {
    if (error instanceof DrxaError) {
      console.log(`Caught DrxaError:`);
      console.log(`  Code: ${error.code}`);
      console.log(`  Message: ${error.message}`);
      console.log(`  Retryable: ${error.isRetryable}`);
      console.log(`  Context:`, error.context);
      
      // Handle specific error codes
      switch (error.code) {
        case ErrorCode.INSUFFICIENT_BALANCE:
          console.log('  → Need to add funds to the wallet');
          break;
        case ErrorCode.NETWORK_ERROR:
          console.log('  → Network issue, will retry automatically');
          break;
        case ErrorCode.INVALID_PARAMETERS:
          console.log('  → Check your parameters');
          break;
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

// Example 2: Manual Retry with Exponential Backoff
async function manualRetryExample() {
  console.log('\n📚 Example 2: Manual Retry with Exponential Backoff\n');
  
  const params = {
    scope: 'wallet',
    userId: '123e4567-e89b-12d3-a456-426614174000',
    chain: 'ethereum',
    index: '0'
  };
  
  // Simulate a flaky network operation
  let attempts = 0;
  const flakyOperation = async () => {
    attempts++;
    console.log(`Attempt ${attempts}...`);
    
    if (attempts < 3) {
      throw new DrxaError(
        ErrorCode.NETWORK_ERROR,
        'Network timeout',
        { attempt: attempts },
        true // retryable
      );
    }
    
    return await wallet.balance(params);
  };
  
  try {
    // Use the built-in retry helper
    const balance = await withRetry(
      flakyOperation,
      {
        maxAttempts: 5,
        delayMs: 1000,
        backoff: 'exponential',
        onRetry: (attempt, nextDelay) => {
          console.log(`  Retry ${attempt} in ${nextDelay}ms...`);
        }
      }
    );
    
    console.log(`✅ Success! Balance: ${balance.toString()} wei`);
  } catch (error) {
    console.error('❌ Failed after all retries:', error.message);
  }
}

// Example 3: Circuit Breaker Pattern
async function circuitBreakerExample() {
  console.log('\n📚 Example 3: Circuit Breaker Pattern\n');
  
  // Create a circuit breaker for external API calls
  const breaker = withCircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 5000,
    halfOpenRetries: 2
  });
  
  // Simulate API calls that might fail
  for (let i = 0; i < 10; i++) {
    try {
      const result = await breaker(async () => {
        // Simulate 60% failure rate
        if (Math.random() > 0.4) {
          throw new Error('API service unavailable');
        }
        return `Success on attempt ${i + 1}`;
      });
      
      console.log(`✅ ${result}`);
    } catch (error) {
      if (error.message.includes('Circuit breaker is OPEN')) {
        console.log(`⚡ Circuit breaker is OPEN - fast failing request ${i + 1}`);
      } else {
        console.log(`❌ Request ${i + 1} failed: ${error.message}`);
      }
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Example 4: Handling Different Error Scenarios
async function errorScenariosExample() {
  console.log('\n📚 Example 4: Different Error Scenarios\n');
  
  const scenarios = [
    {
      name: 'Invalid Address',
      operation: () => wallet.send(
        {
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain: 'bitcoin',
          index: '0'
        },
        'invalid-address-format',
        new Big('1000')
      )
    },
    {
      name: 'Invalid Chain',
      operation: () => wallet.deriveAddress({
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'unsupported-chain' as any,
        index: '0'
      })
    },
    {
      name: 'Invalid Amount',
      operation: () => wallet.send(
        {
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain: 'ethereum',
          index: '0'
        },
        '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA49',
        new Big('-1000') // Negative amount
      )
    }
  ];
  
  for (const scenario of scenarios) {
    console.log(`\nTesting: ${scenario.name}`);
    try {
      await scenario.operation();
    } catch (error) {
      if (error instanceof DrxaError) {
        console.log(`  Error Code: ${error.code}`);
        console.log(`  Message: ${error.message}`);
        console.log(`  Retryable: ${error.isRetryable ? 'Yes' : 'No'}`);
      } else {
        console.log(`  Unexpected error: ${error.message}`);
      }
    }
  }
}

// Example 5: Custom Error Recovery Strategies
async function customRecoveryExample() {
  console.log('\n📚 Example 5: Custom Error Recovery Strategies\n');
  
  class TransactionManager {
    constructor(private wallet: any) {}
    
    async sendWithFallback(params: any, to: string, amount: Big) {
      const chains = ['ethereum', 'bsc', 'polygon']; // Fallback chains
      let lastError: Error | null = null;
      
      for (const chain of chains) {
        try {
          console.log(`Attempting transaction on ${chain}...`);
          
          const result = await this.wallet.send(
            { ...params, chain },
            to,
            amount
          );
          
          console.log(`✅ Success on ${chain}! TX: ${result.txHash}`);
          return result;
        } catch (error) {
          lastError = error;
          console.log(`❌ Failed on ${chain}: ${error.message}`);
          
          if (error instanceof DrxaError) {
            // Don't retry on non-retryable errors
            if (!error.isRetryable) {
              throw error;
            }
          }
        }
      }
      
      throw new DrxaError(
        ErrorCode.ALL_ATTEMPTS_FAILED,
        'Transaction failed on all chains',
        { chains, lastError: lastError?.message }
      );
    }
  }
  
  const txManager = new TransactionManager(wallet);
  
  try {
    await txManager.sendWithFallback(
      {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        index: '0'
      },
      '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA49',
      new Big('1000000000000000') // 0.001 ETH
    );
  } catch (error) {
    console.log('\n❌ All fallback attempts failed:', error.message);
  }
}

// Example 6: Monitoring and Logging Errors
async function errorMonitoringExample() {
  console.log('\n📚 Example 6: Error Monitoring and Logging\n');
  
  // Track error statistics
  const errorStats = new Map<string, number>();
  
  // Subscribe to error events
  sdk.onEvent((event) => {
    if (event.type === 'error') {
      const errorCode = event.data.code || 'UNKNOWN';
      errorStats.set(errorCode, (errorStats.get(errorCode) || 0) + 1);
      
      console.log(`\n🚨 Error Event Captured:`);
      console.log(`  Time: ${new Date(event.timestamp).toISOString()}`);
      console.log(`  Chain: ${event.chain}`);
      console.log(`  Code: ${errorCode}`);
      console.log(`  Message: ${event.data.message}`);
    }
  });
  
  // Simulate some operations that might fail
  const operations = [
    () => wallet.balance({ scope: 'wallet', userId: 'invalid-uuid', chain: 'bitcoin', index: '0' }),
    () => wallet.send({ scope: 'wallet', userId: '123e4567-e89b-12d3-a456-426614174000', chain: 'ethereum', index: '0' }, 'invalid', new Big('1')),
    () => wallet.deriveAddress({ scope: '', userId: '', chain: 'solana', index: '' })
  ];
  
  for (const op of operations) {
    try {
      await op();
    } catch (error) {
      // Errors are automatically logged via events
    }
  }
  
  // Display error statistics
  console.log('\n📊 Error Statistics:');
  errorStats.forEach((count, code) => {
    console.log(`  ${code}: ${count} occurrences`);
  });
}

// Run all examples
async function main() {
  console.log('🛡️  drxa SDK Error Handling Examples');
  console.log('=====================================\n');
  
  await basicErrorHandling();
  await manualRetryExample();
  await circuitBreakerExample();
  await errorScenariosExample();
  await customRecoveryExample();
  await errorMonitoringExample();
  
  console.log('\n✅ All error handling examples completed!');
  
  // Cleanup
  await sdk.shutdown();
}

main().catch(console.error);