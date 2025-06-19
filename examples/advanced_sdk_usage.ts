/**
 * Advanced SDK Usage Example
 * 
 * This example demonstrates advanced features including:
 * - Custom logger and metrics
 * - Configuration management
 * - Adapter preloading
 * - Batch operations
 * - Connection pooling
 * - Environment-based configuration
 */

import { WalletSDK } from '../src/index.js';
import { 
  Logger, 
  MetricsCollector,
  SDKConfig,
  ChainConfig 
} from '../src/types/index.js';
import Big from 'big.js';

// Example 1: Custom Logger Implementation
class CustomLogger implements Logger {
  private logs: Array<{ level: string; message: string; timestamp: Date }> = [];
  
  info(message: string, context?: any): void {
    this.log('INFO', message, context);
  }
  
  warn(message: string, context?: any): void {
    this.log('WARN', message, context);
  }
  
  error(message: string, error?: Error, context?: any): void {
    this.log('ERROR', `${message} - ${error?.message || ''}`, context);
  }
  
  debug(message: string, context?: any): void {
    if (process.env.DEBUG) {
      this.log('DEBUG', message, context);
    }
  }
  
  private log(level: string, message: string, context?: any): void {
    const entry = { level, message, timestamp: new Date() };
    this.logs.push(entry);
    
    const prefix = {
      'INFO': '📘',
      'WARN': '⚠️ ',
      'ERROR': '❌',
      'DEBUG': '🔍'
    }[level] || '📝';
    
    console.log(`${prefix} [${level}] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }
  
  getLogs() {
    return this.logs;
  }
}

// Example 2: Custom Metrics Collector
class CustomMetrics implements MetricsCollector {
  private metrics = new Map<string, any[]>();
  
  recordLatency(operation: string, duration: number): void {
    this.record(`latency.${operation}`, duration);
  }
  
  recordError(operation: string, error: Error): void {
    this.record(`error.${operation}`, { 
      message: error.message, 
      timestamp: Date.now() 
    });
  }
  
  recordSuccess(operation: string): void {
    this.increment(`success.${operation}`);
  }
  
  recordCustom(metric: string, value: any): void {
    this.record(metric, value);
  }
  
  private record(key: string, value: any): void {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key)!.push(value);
  }
  
  private increment(key: string): void {
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + 1);
  }
  
  getReport() {
    const report: any = {};
    this.metrics.forEach((value, key) => {
      if (key.startsWith('latency.')) {
        const latencies = value as number[];
        report[key] = {
          count: latencies.length,
          avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          min: Math.min(...latencies),
          max: Math.max(...latencies)
        };
      } else {
        report[key] = value;
      }
    });
    return report;
  }
}

// Example 3: Environment-based Configuration
function getEnvironmentConfig(): Partial<SDKConfig> {
  const env = process.env.NODE_ENV || 'development';
  
  const configs = {
    development: {
      defaultConfig: {
        maxRetries: 3,
        timeout: 30000,
        retryDelay: 1000
      },
      chainConfigs: {
        ethereum: {
          endpoints: {
            http: { url: 'https://eth-mainnet.g.alchemy.com/v2/demo' }
          }
        },
        bitcoin: {
          endpoints: {
            http: { url: 'https://blockstream.info/api' }
          }
        }
      }
    },
    production: {
      defaultConfig: {
        maxRetries: 5,
        timeout: 60000,
        retryDelay: 2000
      },
      chainConfigs: {
        ethereum: {
          endpoints: {
            http: { url: process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/your-key' }
          }
        },
        bitcoin: {
          endpoints: {
            http: { url: process.env.BTC_RPC_URL || 'https://blockstream.info/api' }
          }
        }
      }
    }
  };
  
  return configs[env as keyof typeof configs] || configs.development;
}

// Example 4: Advanced SDK Initialization
async function advancedInitialization() {
  console.log('\n📚 Example: Advanced SDK Initialization\n');
  
  const logger = new CustomLogger();
  const metrics = new CustomMetrics();
  const envConfig = getEnvironmentConfig();
  
  const sdk = new WalletSDK({
    seed: '6aeb8aa877e9bc8c26fc6a6d4d852e41d51e4bf62266f1fa9914060a6b35a5a6',
    logger,
    metrics,
    environment: process.env.NODE_ENV as any || 'development',
    ...envConfig
  });
  
  // Preload frequently used adapters for better performance
  console.log('🚀 Preloading adapters...');
  const start = Date.now();
  
  await sdk.wallet.preloadAdapters(['bitcoin', 'ethereum', 'solana']);
  
  console.log(`✅ Adapters preloaded in ${Date.now() - start}ms\n`);
  
  return { sdk, logger, metrics };
}

// Example 5: Batch Operations
async function batchOperationsExample(sdk: WalletSDK) {
  console.log('\n📚 Example: Batch Operations\n');
  
  const wallet = sdk.createWallet();
  
  // Define multiple addresses to check
  const addresses = [
    { scope: 'wallet', userId: 'user-1', chain: 'bitcoin' as const, index: '0' },
    { scope: 'wallet', userId: 'user-1', chain: 'ethereum' as const, index: '0' },
    { scope: 'wallet', userId: 'user-1', chain: 'solana' as const, index: '0' },
    { scope: 'trading', userId: 'user-2', chain: 'bitcoin' as const, index: '0' },
    { scope: 'trading', userId: 'user-2', chain: 'ethereum' as const, index: '0' }
  ];
  
  console.log('🔄 Fetching balances for 5 addresses...');
  const startTime = Date.now();
  
  // Batch balance check
  const balances = await wallet.batchBalance(addresses);
  
  console.log(`✅ Completed in ${Date.now() - startTime}ms\n`);
  
  // Display results
  balances.forEach((balance, index) => {
    const addr = addresses[index];
    console.log(`${addr.chain} (${addr.scope}/${addr.userId}): ${balance.toString()}`);
  });
  
  // Batch address derivation
  console.log('\n🔄 Deriving 10 addresses...');
  const derivationStart = Date.now();
  
  const derivationParams = Array.from({ length: 10 }, (_, i) => ({
    scope: 'session',
    userId: 'batch-user',
    chain: 'ethereum' as const,
    index: i.toString()
  }));
  
  const derivedAddresses = await Promise.all(
    derivationParams.map(params => wallet.deriveAddress(params))
  );
  
  console.log(`✅ Derived ${derivedAddresses.length} addresses in ${Date.now() - derivationStart}ms`);
  console.log(`First address: ${derivedAddresses[0]}`);
  console.log(`Last address: ${derivedAddresses[9]}`);
}

// Example 6: Connection Pool Management
async function connectionPoolExample(sdk: WalletSDK) {
  console.log('\n📚 Example: Connection Pool Management\n');
  
  // The SDK automatically manages connection pools
  // but you can monitor their status via events
  
  let activeConnections = 0;
  
  sdk.onEvent((event) => {
    if (event.type === 'connection') {
      if (event.data.status === 'connected') {
        activeConnections++;
        console.log(`🔌 Connection established to ${event.chain} (${event.data.endpoint})`);
      } else if (event.data.status === 'disconnected') {
        activeConnections--;
        console.log(`🔌 Connection closed to ${event.chain}`);
      }
      console.log(`   Active connections: ${activeConnections}`);
    }
  });
  
  // Perform operations that will use connection pools
  const wallet = sdk.createWallet();
  const chains = ['bitcoin', 'ethereum', 'solana'] as const;
  
  console.log('Performing operations across multiple chains...\n');
  
  // Concurrent operations will reuse connections
  await Promise.all(
    chains.map(async (chain) => {
      for (let i = 0; i < 3; i++) {
        await wallet.balance({
          scope: 'test',
          userId: 'pool-test',
          chain,
          index: i.toString()
        });
      }
    })
  );
  
  console.log('\n✅ Connection pooling demonstrated');
}

// Example 7: Configuration Override
async function configurationOverrideExample(sdk: WalletSDK) {
  console.log('\n📚 Example: Configuration Override\n');
  
  const wallet = sdk.createWallet();
  
  // Override configuration for specific operations
  const customConfig = {
    maxRetries: 10,
    timeout: 5000,
    retryDelay: 500
  };
  
  console.log('Using custom configuration for critical operation...');
  
  try {
    // This operation will use the custom configuration
    const address = await wallet.deriveAddress(
      {
        scope: 'critical',
        userId: 'important-user',
        chain: 'bitcoin',
        index: '0'
      },
      customConfig // Pass custom config as second parameter
    );
    
    console.log(`✅ Address derived with custom config: ${address}`);
  } catch (error) {
    console.error('Operation failed even with custom config:', error.message);
  }
}

// Example 8: Metrics and Performance Monitoring
async function metricsExample(sdk: WalletSDK, metrics: CustomMetrics) {
  console.log('\n📚 Example: Metrics and Performance Monitoring\n');
  
  const wallet = sdk.createWallet();
  
  // Perform various operations
  const operations = [
    { chain: 'bitcoin' as const, count: 5 },
    { chain: 'ethereum' as const, count: 5 },
    { chain: 'solana' as const, count: 5 }
  ];
  
  for (const { chain, count } of operations) {
    console.log(`\nPerforming ${count} operations on ${chain}...`);
    
    for (let i = 0; i < count; i++) {
      const start = Date.now();
      
      try {
        await wallet.deriveAddress({
          scope: 'metrics-test',
          userId: 'test-user',
          chain,
          index: i.toString()
        });
        
        metrics.recordLatency(`derive.${chain}`, Date.now() - start);
        metrics.recordSuccess(`derive.${chain}`);
      } catch (error) {
        metrics.recordError(`derive.${chain}`, error as Error);
      }
    }
  }
  
  // Display metrics report
  console.log('\n📊 Metrics Report:');
  const report = metrics.getReport();
  
  Object.entries(report).forEach(([key, value]) => {
    if (key.startsWith('latency.')) {
      console.log(`\n${key}:`);
      console.log(`  Count: ${value.count}`);
      console.log(`  Average: ${value.avg.toFixed(2)}ms`);
      console.log(`  Min: ${value.min}ms`);
      console.log(`  Max: ${value.max}ms`);
    } else if (key.startsWith('success.')) {
      console.log(`${key}: ${value} operations`);
    }
  });
}

// Main function to run all examples
async function main() {
  console.log('🚀 Advanced drxa SDK Usage Examples');
  console.log('====================================\n');
  
  // Initialize SDK with advanced features
  const { sdk, logger, metrics } = await advancedInitialization();
  
  try {
    // Run examples
    await batchOperationsExample(sdk);
    await connectionPoolExample(sdk);
    await configurationOverrideExample(sdk);
    await metricsExample(sdk, metrics);
    
    // Display logger summary
    console.log('\n📝 Logger Summary:');
    const logs = logger.getLogs();
    const logCounts = logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(logCounts).forEach(([level, count]) => {
      console.log(`  ${level}: ${count} entries`);
    });
    
  } finally {
    // Graceful shutdown
    console.log('\n🛑 Shutting down SDK...');
    await sdk.shutdown();
    console.log('✅ Shutdown complete');
  }
}

main().catch(console.error);