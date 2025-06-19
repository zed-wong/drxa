import { describe, it, expect, beforeAll } from 'vitest';
import { AdapterTestFramework } from './AdapterTestFramework.js';
import { 
  BitcoinTransactionConfig, 
  EvmTransactionConfig, 
  SolanaTransactionConfig 
} from '../../types/index.js';
import Big from 'big.js';

describe('Transaction Configuration Tests', () => {
  let framework: AdapterTestFramework;

  beforeAll(() => {
    framework = new AdapterTestFramework();
  });

  describe('Bitcoin Transaction Configuration', () => {
    it('should accept custom fee rate configuration', async () => {
      const adapter = await framework['registry'].loadAdapter('bitcoin');
      
      const config: BitcoinTransactionConfig = {
        feeRate: new Big(25), // 25 sat/vbyte
        rbf: true,
        priority: 'high',
        utxoSelection: 'largest-first',
        memo: 'Test transaction with custom config'
      };
      
      const result = await adapter.send(
        {
          scope: 'test',
          userId: 'config-test-user',
          chain: 'bitcoin',
          index: '0'
        },
        'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        new Big('50000'), // 0.0005 BTC
        config
      );
      
      expect(result.txHash).toBeDefined();
      expect(result.fee).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should apply different UTXO selection strategies', async () => {
      const adapter = await framework['registry'].loadAdapter('bitcoin');
      
      const configs = [
        { utxoSelection: 'largest-first' as const },
        { utxoSelection: 'smallest-first' as const },
        { utxoSelection: 'auto' as const }
      ];
      
      for (const config of configs) {
        const result = await adapter.send(
          {
            scope: 'test',
            userId: 'utxo-strategy-test',
            chain: 'bitcoin',
            index: '0'
          },
          'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          new Big('25000'),
          config
        );
        
        expect(result.txHash).toBeDefined();
      }
    });
  });

  describe('Ethereum Transaction Configuration', () => {
    it('should accept EIP-1559 transaction configuration', async () => {
      const adapter = await framework['registry'].loadAdapter('ethereum');
      
      const config: EvmTransactionConfig = {
        type: 2, // EIP-1559
        maxFeePerGas: new Big('30000000000'), // 30 gwei
        maxPriorityFeePerGas: new Big('2000000000'), // 2 gwei tip
        gasLimit: new Big('21000'),
        priority: 'high'
      };
      
      const result = await adapter.send(
        {
          scope: 'test',
          userId: 'eip1559-test-user',
          chain: 'ethereum',
          index: '0'
        },
        '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        new Big('1000000000000000000'), // 1 ETH
        config
      );
      
      expect(result.txHash).toBeDefined();
      expect(result.fee).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should accept legacy transaction configuration', async () => {
      const adapter = await framework['registry'].loadAdapter('ethereum');
      
      const config: EvmTransactionConfig = {
        type: 0, // Legacy
        gasPrice: new Big('20000000000'), // 20 gwei
        gasLimit: new Big('21000'),
        nonce: 42,
        chainId: 1
      };
      
      const result = await adapter.send(
        {
          scope: 'test',
          userId: 'legacy-tx-test',
          chain: 'ethereum',
          index: '0'
        },
        '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        new Big('500000000000000000'), // 0.5 ETH
        config
      );
      
      expect(result.txHash).toBeDefined();
      expect(result.fee).toBeDefined();
    });

    it('should handle contract interaction data', async () => {
      const adapter = await framework['registry'].loadAdapter('ethereum');
      
      const config: EvmTransactionConfig = {
        gasLimit: new Big('100000'), // Higher gas for contract
        data: '0xa9059cbb000000000000000000000000742d35cc6635c0532925a3b8d7389c8f0e7c1fd90000000000000000000000000000000000000000000000000de0b6b3a7640000', // ERC20 transfer
        value: new Big('0') // No ETH value for ERC20 transfer
      };
      
      const result = await adapter.send(
        {
          scope: 'test',
          userId: 'contract-test',
          chain: 'ethereum',
          index: '0'
        },
        '0xA0b86a33E6441a6e01c6210C4CA17e91F4F2c6e0', // Token contract
        new Big('1'), // Minimal ETH amount (will be overridden by config.value)
        config
      );
      
      expect(result.txHash).toBeDefined();
    });
  });

  describe('Solana Transaction Configuration', () => {
    it('should accept compute unit configuration', async () => {
      const adapter = await framework['registry'].loadAdapter('solana');
      
      const config: SolanaTransactionConfig = {
        computeUnits: 200000,
        computeUnitPrice: new Big('1000'), // microlamports per CU
        preflightCommitment: 'confirmed',
        priority: 'urgent'
      };
      
      const result = await adapter.send(
        {
          scope: 'test',
          userId: 'solana-compute-test',
          chain: 'solana',
          index: '0'
        },
        'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1jmr',
        new Big('1000000000'), // 1 SOL
        config
      );
      
      expect(result.txHash).toBeDefined();
      expect(result.fee).toBeDefined();
    });

    it('should handle advanced Solana options', async () => {
      const adapter = await framework['registry'].loadAdapter('solana');
      
      const config: SolanaTransactionConfig = {
        skipPreflight: true,
        maxRetries: 5,
        recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
        feePayer: 'FeePayer123456789012345678901234567890123456'
      };
      
      const result = await adapter.send(
        {
          scope: 'test',
          userId: 'solana-advanced-test',
          chain: 'solana',
          index: '0'
        },
        'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1jmr',
        new Big('500000000'), // 0.5 SOL
        config
      );
      
      expect(result.txHash).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should generate different transaction hashes for different configurations', async () => {
      const adapter = await framework['registry'].loadAdapter('bitcoin');
      
      const baseParams = {
        scope: 'test',
        userId: 'hash-test-user',
        chain: 'bitcoin' as const,
        index: '0'
      };
      
      const config1: BitcoinTransactionConfig = { feeRate: new Big(10) };
      const config2: BitcoinTransactionConfig = { feeRate: new Big(20) };
      
      const result1 = await adapter.send(
        baseParams,
        'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        new Big('50000'),
        config1
      );
      
      const result2 = await adapter.send(
        baseParams,
        'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        new Big('50000'),
        config2
      );
      
      expect(result1.txHash).not.toBe(result2.txHash);
    });

    it('should work without configuration (backwards compatibility)', async () => {
      const adapter = await framework['registry'].loadAdapter('ethereum');
      
      const result = await adapter.send(
        {
          scope: 'test',
          userId: 'no-config-test',
          chain: 'ethereum',
          index: '0'
        },
        '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        new Big('1000000000000000000')
        // No config parameter
      );
      
      expect(result.txHash).toBeDefined();
      expect(result.status).toBe('pending');
    });
  });

  describe('Priority and Memo Support', () => {
    it('should handle priority levels', async () => {
      const adapter = await framework['registry'].loadAdapter('bitcoin');
      
      const priorities = ['low', 'normal', 'high', 'urgent'] as const;
      
      for (const priority of priorities) {
        const config: BitcoinTransactionConfig = { priority };
        
        const result = await adapter.send(
          {
            scope: 'test',
            userId: `priority-${priority}-test`,
            chain: 'bitcoin',
            index: '0'
          },
          'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          new Big('25000'),
          config
        );
        
        expect(result.txHash).toBeDefined();
      }
    });

    it('should handle memo fields', async () => {
      const adapter = await framework['registry'].loadAdapter('ethereum');
      
      const config: EvmTransactionConfig = {
        memo: 'Payment for services rendered on 2024-01-15'
      };
      
      const result = await adapter.send(
        {
          scope: 'test',
          userId: 'memo-test',
          chain: 'ethereum',
          index: '0'
        },
        '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        new Big('1000000000000000000'),
        config
      );
      
      expect(result.txHash).toBeDefined();
    });
  });
});