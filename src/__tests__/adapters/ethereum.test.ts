import { describe, it, expect, beforeAll, vi } from 'vitest';
import Big from 'big.js';
import { AdapterTestFramework } from './AdapterTestFramework.js';
import { SupportedChain } from '../../types/index.js';

const framework = new AdapterTestFramework();

// Ethereum-specific test cases
const testCases = [
  ...AdapterTestFramework.createStandardTestCases('ethereum'),
  {
    name: 'mainnet address',
    deriveParams: {
      scope: 'production',
      userId: 'mainnet-user-001',
      chain: 'ethereum' as SupportedChain,
      index: '0'
    },
    expectedAddressPattern: /^0x[a-fA-F0-9]{40}$/,
    testSend: {
      to: '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
      amount: new Big('1000000000000000000'), // 1 ETH in wei
    }
  }
];

// Mock Ethereum RPC responses
beforeAll(() => {
  // Mock balance check
  framework.mockApiResponse('POST:https://eth.llamarpc.com', {
    endpoint: 'https://eth.llamarpc.com',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: '0x56bc75e2d630e000' // 100 ETH in wei (hex)
    }
  });

  // Mock gas price
  framework.mockApiResponse('POST:*gasPrice*', {
    endpoint: '*gasPrice*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: '0x4a817c800' // 20 gwei
    }
  });

  // Mock transaction count (nonce)
  framework.mockApiResponse('POST:*getTransactionCount*', {
    endpoint: '*getTransactionCount*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: '0x42' // nonce 66
    }
  });

  // Mock gas estimation
  framework.mockApiResponse('POST:*estimateGas*', {
    endpoint: '*estimateGas*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: '0x5208' // 21000 gas for ETH transfer
    }
  });

  // Mock transaction broadcast
  framework.mockApiResponse('POST:*sendRawTransaction*', {
    endpoint: '*sendRawTransaction*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: '0x' + 'a'.repeat(64) // Mock transaction hash
    }
  });

  // Mock latest block number
  framework.mockApiResponse('POST:*blockNumber*', {
    endpoint: '*blockNumber*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: '0x1234567' // Mock block number
    }
  });

  // Mock block data for subscription
  framework.mockApiResponse('POST:*getBlockByNumber*', {
    endpoint: '*getBlockByNumber*',
    method: 'POST',
    response: {
      jsonrpc: '2.0',
      id: 1,
      result: {
        number: '0x1234567',
        hash: '0x' + 'b'.repeat(64),
        transactions: []
      }
    }
  });
});

framework.createAdapterTestSuite('ethereum', testCases, {
  skipNetworkTests: false,
  skipTransactionTests: false,
});

describe('Ethereum-specific functionality', () => {
  it('should generate valid Ethereum addresses', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum');
    
    const address = await adapter.deriveAddress({
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain: 'ethereum',
      index: '0'
    });

    // Ethereum addresses should be 42 characters starting with 0x
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(address.length).toBe(42);
  });

  it('should handle EIP-1559 transactions', async () => {
    const framework = new AdapterTestFramework();
    
    // Mock EIP-1559 fee data
    framework.mockApiResponse('POST:*feeHistory*', {
      endpoint: '*feeHistory*',
      method: 'POST',
      response: {
        jsonrpc: '2.0',
        id: 1,
        result: {
          baseFeePerGas: ['0x4a817c800'], // 20 gwei
          gasUsedRatio: [0.5],
          reward: [['0x77359400']] // 2 gwei tip
        }
      }
    });

    const adapter = await framework['registry'].loadAdapter('ethereum');
    
    if (adapter.estimateFee) {
      const fee = await adapter.estimateFee(
        {
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain: 'ethereum',
          index: '0'
        },
        '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        new Big('1000000000000000000') // 1 ETH
      );

      expect(fee.totalFee.gt(0)).toBe(true);
      expect(fee.baseFee).toBeDefined();
      expect(fee.priorityFee).toBeDefined();
    }
  });

  it('should work with different EVM chains', async () => {
    const evmChains: SupportedChain[] = ['bsc', 'polygon', 'avalanche', 'arbitrum'];
    
    for (const chain of evmChains) {
      const framework = new AdapterTestFramework();
      
      try {
        const adapter = await framework['registry'].loadAdapter(chain);
        
        const address = await adapter.deriveAddress({
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain,
          index: '0'
        });

        // All EVM chains should generate valid Ethereum-style addresses
        expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(adapter.chainName).toBe(chain);
      } catch (error) {
        console.warn(`Chain ${chain} not available for testing:`, error);
      }
    }
  });

  it('should handle ERC20 token operations', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum') as any;
    
    // Check if ERC20 methods are available
    if (adapter.tokenBalance && adapter.sendToken) {
      const usdcContract = '0xA0b86a33E6417c2fdf4eeF3c7b30e8C86bC93c9e'; // Example USDC contract
      
      // Mock ERC20 balance call
      framework.mockApiResponse('POST:*call*', {
        endpoint: '*call*',
        method: 'POST',
        response: {
          jsonrpc: '2.0',
          id: 1,
          result: '0x' + (1000000).toString(16).padStart(64, '0') // 1 USDC (6 decimals)
        }
      });

      const tokenBalance = await adapter.tokenBalance(
        {
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain: 'ethereum',
          index: '0'
        },
        usdcContract,
        6 // USDC decimals
      );

      expect(tokenBalance instanceof Big).toBe(true);
      expect(tokenBalance.gte(0)).toBe(true);
    }
  });

  it('should handle gas estimation correctly', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum');
    
    if (adapter.estimateFee) {
      const fee = await adapter.estimateFee(
        {
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain: 'ethereum',
          index: '0'
        },
        '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        new Big('1000000000000000000') // 1 ETH
      );

      // Gas estimation should return reasonable values
      expect(fee.totalFee.gt(0)).toBe(true);
      expect(fee.gasLimit).toBeDefined();
      expect(fee.gasPrice || fee.baseFee).toBeDefined();
      
      // Fee should be less than 0.01 ETH for normal transaction
      expect(fee.totalFee.lt('10000000000000000')).toBe(true);
    }
  });

  it('should handle nonce management', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum') as any;
    
    // Send multiple transactions to test nonce management
    const params = {
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain: 'ethereum' as SupportedChain,
      index: '0'
    };

    const tx1 = await adapter.send(params, '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9', new Big('1000000000000000000'));
    const tx2 = await adapter.send(params, '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9', new Big('1000000000000000000'));

    expect(tx1.txHash).toBeDefined();
    expect(tx2.txHash).toBeDefined();
    expect(tx1.txHash).not.toBe(tx2.txHash);
  });

  it('should validate address format', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum');
    
    const params = {
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain: 'ethereum' as SupportedChain,
      index: '0'
    };

    // Test invalid addresses
    const invalidAddresses = [
      '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd', // Too short
      '742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9', // Missing 0x
      '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1FdG', // Invalid character
      '0x', // Empty
      '', // Empty string
    ];

    for (const invalidAddress of invalidAddresses) {
      await expect(adapter.send(params, invalidAddress, new Big('1000000000000000000')))
        .rejects.toThrow();
    }
  });
});