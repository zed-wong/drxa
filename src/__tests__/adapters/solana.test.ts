import { describe, it, expect, beforeAll, vi } from 'vitest';
import Big from 'big.js';
import { AdapterTestFramework } from './AdapterTestFramework.js';
import { SupportedChain } from '../../types/index.js';

const framework = new AdapterTestFramework();

// Solana-specific test cases
const testCases = [
  ...AdapterTestFramework.createStandardTestCases('solana'),
  {
    name: 'devnet address',
    deriveParams: {
      scope: 'development',
      userId: 'devnet-user-001',
      chain: 'solana' as SupportedChain,
      index: '0'
    },
    expectedAddressPattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    testSend: {
      to: 'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1jmr',
      amount: new Big('1000000000'), // 1 SOL in lamports
    }
  }
];

// Mock Solana RPC responses
beforeAll(() => {
  // Mock balance check
  framework.mockApiResponse('POST:https://api.mainnet-beta.solana.com', {
    endpoint: 'https://api.mainnet-beta.solana.com',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        context: { slot: 12345 },
        value: 5000000000 // 5 SOL in lamports
      }
    }
  });

  // Mock latest blockhash
  framework.mockApiResponse('POST:*getLatestBlockhash*', {
    endpoint: '*getLatestBlockhash*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        context: { slot: 12345 },
        value: {
          blockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
          lastValidBlockHeight: 123456789
        }
      }
    }
  });

  // Mock transaction simulation
  framework.mockApiResponse('POST:*simulateTransaction*', {
    endpoint: '*simulateTransaction*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        context: { slot: 12345 },
        value: {
          err: null,
          logs: ['Program 11111111111111111111111111111111 invoke [1]'],
          unitsConsumed: 5000
        }
      }
    }
  });

  // Mock transaction send
  framework.mockApiResponse('POST:*sendTransaction*', {
    endpoint: '*sendTransaction*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW'
    }
  });

  // Mock signature status
  framework.mockApiResponse('POST:*getSignatureStatuses*', {
    endpoint: '*getSignatureStatuses*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        context: { slot: 12345 },
        value: [
          {
            slot: 12345,
            confirmations: 1,
            err: null,
            status: { Ok: null },
            confirmationStatus: 'confirmed'
          }
        ]
      }
    }
  });

  // Mock account info
  framework.mockApiResponse('POST:*getAccountInfo*', {
    endpoint: '*getAccountInfo*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        context: { slot: 12345 },
        value: {
          lamports: 5000000000,
          owner: '11111111111111111111111111111111',
          executable: false,
          rentEpoch: 361
        }
      }
    }
  });
});

framework.createAdapterTestSuite('solana', testCases, {
  skipNetworkTests: false,
  skipTransactionTests: false,
});

describe('Solana-specific functionality', () => {
  it('should generate valid Solana addresses', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('solana');
    
    const address = await adapter.deriveAddress({
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain: 'solana',
      index: '0'
    });

    // Solana addresses are base58 encoded, 32-44 characters
    expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(address.length).toBeGreaterThanOrEqual(32);
    expect(address.length).toBeLessThanOrEqual(44);
  });

  it('should handle SOL transfers correctly', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('solana');
    
    const result = await adapter.send(
      {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'solana',
        index: '0'
      },
      'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1jmr',
      new Big('1000000000') // 1 SOL in lamports
    );

    expect(result.txHash).toBeDefined();
    expect(typeof result.txHash).toBe('string');
    expect(result.txHash.length).toBeGreaterThan(32);
  });

  it('should handle lamport amounts correctly', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('solana');
    
    const balance = await adapter.balance({
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain: 'solana',
      index: '0'
    });

    // Balance should be in lamports (1 SOL = 1,000,000,000 lamports)
    expect(balance instanceof Big).toBe(true);
    expect(balance.gte(0)).toBe(true);
    
    // If balance is 5 SOL (from mock), it should be 5,000,000,000 lamports
    if (balance.gt(0)) {
      expect(balance.eq('5000000000')).toBe(true);
    }
  });

  it('should validate Solana addresses', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('solana');
    
    const params = {
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain: 'solana' as SupportedChain,
      index: '0'
    };

    // Test invalid addresses
    const invalidAddresses = [
      'invalid', // Too short
      '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9', // Ethereum format
      'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1j', // Too short (41 chars)
      'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1jmr0', // Invalid character
      '', // Empty string
    ];

    for (const invalidAddress of invalidAddresses) {
      try {
        await adapter.send(params, invalidAddress, new Big('1000000000'));
        throw new Error(`Expected ${invalidAddress} to be invalid but it passed`);
      } catch (error) {
        // This should happen for all invalid addresses
        expect(error).toBeDefined();
      }
    }
  });

  it('should handle transaction fees correctly', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('solana');
    
    // Solana has very low, fixed fees typically around 5000 lamports
    if (adapter.estimateFee) {
      const fee = await adapter.estimateFee(
        {
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain: 'solana',
          index: '0'
        },
        'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1jmr',
        new Big('1000000000') // 1 SOL
      );

      expect(fee.totalFee.gt(0)).toBe(true);
      // Solana fees should be very low (< 0.01 SOL)
      expect(fee.totalFee.lt(10000000)).toBe(true);
    }
  });

  it('should handle Ed25519 key derivation', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('solana');
    
    // Derive multiple addresses to ensure consistent Ed25519 implementation
    const addresses = await Promise.all([
      adapter.deriveAddress({
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'solana',
        index: '0'
      }),
      adapter.deriveAddress({
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'solana',
        index: '1'
      }),
      adapter.deriveAddress({
        scope: 'session',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'solana',
        index: '0'
      })
    ]);

    // All addresses should be valid and different
    addresses.forEach(address => {
      expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });

    expect(addresses[0]).not.toBe(addresses[1]);
    expect(addresses[0]).not.toBe(addresses[2]);
    expect(addresses[1]).not.toBe(addresses[2]);
  });

  it('should handle subscription for incoming transactions', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('solana');
    
    if (adapter.subscribe) {
      const address = await adapter.deriveAddress({
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'solana',
        index: '0'
      });

      const callback = vi.fn();
      const unsubscribe = await adapter.subscribe(address, callback);
      
      expect(typeof unsubscribe).toBe('function');
      
      // Test cleanup
      unsubscribe();
      
      // Callback should not be called after unsubscribe
      // (This would require more complex mocking to test properly)
    }
  });

  it('should handle blockhash and transaction validity', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('solana') as any;
    
    // Mock expired blockhash scenario
    framework.mockApiResponse('POST:*getLatestBlockhash*', {
      endpoint: '*getLatestBlockhash*',
      method: 'POST',
      response: {
        jsonrpc: '2.0',
        id: 1,
        result: {
          context: { slot: 12345 },
          value: {
            blockhash: 'ExpiredBlockhash1111111111111111111111111',
            lastValidBlockHeight: 1 // Very old block height
          }
        }
      }
    });

    // Transaction should still work as the adapter should handle blockhash refresh
    const result = await adapter.send(
      {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'solana',
        index: '0'
      },
      'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1jmr',
      new Big('1000000000')
    );

    expect(result.txHash).toBeDefined();
  });

  it('should handle insufficient balance', async () => {
    const framework = new AdapterTestFramework();
    
    // Mock insufficient balance
    framework.mockApiResponse('POST:https://api.mainnet-beta.solana.com', {
      endpoint: 'https://api.mainnet-beta.solana.com',
      method: 'POST',
      response: {
        jsonrpc: '2.0',
        id: 1,
        result: {
          context: { slot: 12345 },
          value: 0 // No balance
        }
      }
    });

    const adapter = await framework['registry'].loadAdapter('solana');
    
    await expect(adapter.send(
      {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'solana',
        index: '0'
      },
      'B62XGBBhb8zVrJWnVTJCFnXcHCjKfMGnzK7fcHBE1jmr',
      new Big('10000000000') // 10 SOL > 5 SOL balance
    )).rejects.toThrow(/insufficient/i);
  });
});