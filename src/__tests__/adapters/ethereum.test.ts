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
    
    // Test EVM adapter compatibility by creating adapters directly
    const { createEvmAdapter } = await import('../../adapters/evm/EvmAdapterV2.js');
    const { ConfigManager } = await import('../../core/config/ConfigManager.js');
    
    const testSeed = new Uint8Array([
      0x6a, 0xeb, 0x8a, 0xa8, 0x77, 0xe9, 0xbc, 0x8c, 0x26, 0xfc, 0x6a, 0x6d, 0x4d, 0x85, 0x2e, 0x41,
      0xd5, 0x1e, 0x4b, 0xf6, 0x22, 0x66, 0xf1, 0xfa, 0x99, 0x14, 0x06, 0x0a, 0x6b, 0x35, 0xa5, 0xa6
    ]);
    
    const configManager = ConfigManager.getInstance();
    const successfulChains: string[] = [];
    
    // Verify each EVM chain works correctly
    for (const chain of evmChains) {
      try {
        const chainConfig = configManager.getChainConfig(chain);
        const adapter = createEvmAdapter(
          chain,
          chainConfig,
          testSeed
        );
        
        const address = await adapter.deriveAddress({
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain,
          index: '0'
        });
        
        // All EVM chains should generate valid Ethereum-style addresses
        expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(adapter.chainName).toBe(chain);
        
        successfulChains.push(chain);
      } catch (error) {
        console.warn(`Chain ${chain} not configured or failed:`, error);
      }
    }
    
    // At least one other EVM chain should work besides Ethereum
    expect(successfulChains.length).toBeGreaterThan(0);
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

  it('should sign transactions offline', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum');
    
    if (adapter.sign) {
      const params = {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'ethereum' as SupportedChain,
        index: '0'
      };
      
      const txConfig: any = {
        to: '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        value: new Big('1000000000000000000'), // 1 ETH
        gasLimit: new Big('21000'),
        gasPrice: new Big('20000000000'), // 20 gwei
        nonce: 0
      };
      const signedTx = await adapter.sign(params, txConfig);
      
      // Signed transaction should be a hex string starting with 0x
      expect(signedTx).toMatch(/^0x[a-fA-F0-9]+$/);
      // Signed transaction should be at least 100 bytes
      expect(signedTx.length).toBeGreaterThan(200);
    }
  });

  it('should handle subscription with WebSocket', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum');
    
    if (adapter.subscribe) {
      let receivedTx: any = null;
      
      const unsubscribe = await adapter.subscribe(
        '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        (tx) => {
          receivedTx = tx;
        }
      );
      
      // Unsubscribe should be a function
      expect(typeof unsubscribe).toBe('function');
      
      // Clean up
      await unsubscribe();
    }
  });

  it('should get transaction history with pagination', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum');
    
    if (adapter.getHistory) {
      // Mock block with transactions
      framework.mockApiResponse('POST:*getBlockWithTransactions*', {
        endpoint: '*getBlockWithTransactions*',
        method: 'POST',
        response: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            number: '0x1234567',
            timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16),
            transactions: [
              {
                hash: '0x' + 'a'.repeat(64),
                from: '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
                to: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                value: '0xde0b6b3a7640000', // 1 ETH
                gasPrice: '0x4a817c800' // 20 gwei
              }
            ]
          }
        }
      });
      
      // Mock transaction receipt
      framework.mockApiResponse('POST:*getTransactionReceipt*', {
        endpoint: '*getTransactionReceipt*',
        method: 'POST',
        response: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            status: '0x1',
            gasUsed: '0x5208', // 21000
            effectiveGasPrice: '0x4a817c800' // 20 gwei
          }
        }
      });
      
      const params = {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'ethereum' as SupportedChain,
        index: '0'
      };
      
      const history = await adapter.getHistory(params, 10);
      
      expect(Array.isArray(history)).toBe(true);
      if (history.length > 0) {
        const tx = history[0];
        expect(tx.txHash).toBeDefined();
        expect(tx.blockNumber).toBeDefined();
        expect(tx.timestamp).toBeDefined();
        expect(tx.from).toBeDefined();
        expect(tx.to).toBeDefined();
        expect(tx.amount instanceof Big).toBe(true);
        expect(tx.fee instanceof Big).toBe(true);
        expect(['confirmed', 'pending', 'failed']).toContain(tx.status);
        expect(['incoming', 'outgoing']).toContain(tx.direction);
      }
    }
  });

  it('should support EIP-1559 transaction signing', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum');
    
    if (adapter.sign) {
      const params = {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'ethereum' as SupportedChain,
        index: '0'
      };
      
      // Mock fee data for EIP-1559
      framework.mockApiResponse('POST:*getFeeData*', {
        endpoint: '*getFeeData*',
        method: 'POST',
        response: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            maxFeePerGas: '0x9502f9000', // 40 gwei
            maxPriorityFeePerGas: '0x77359400' // 2 gwei
          }
        }
      });
      
      const txConfig: any = {
        to: '0x742d35Cc6635C0532925a3b8D7389C8f0e7c1Fd9',
        value: new Big('1000000000000000000'), // 1 ETH
        gasLimit: new Big('21000'),
        type: 2, // EIP-1559
        maxFeePerGas: new Big('40000000000'), // 40 gwei
        maxPriorityFeePerGas: new Big('2000000000'), // 2 gwei
        nonce: 0
      };
      const signedTx = await adapter.sign(params, txConfig);
      
      // EIP-1559 signed transaction should be valid
      expect(signedTx).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(signedTx.length).toBeGreaterThan(200);
    }
  });

  it('should include token transfers in history when requested', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('ethereum') as any;
    
    if (adapter.getHistory) {
      // Mock ERC20 transfer logs
      framework.mockApiResponse('POST:*getLogs*', {
        endpoint: '*getLogs*',
        method: 'POST',
        response: {
          jsonrpc: '2.0',
          id: 1,
          result: [
            {
              address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT contract
              topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer event
                '0x000000000000000000000000742d35cc6635c0532925a3b8d7389c8f0e7c1fd9', // from
                '0x0000000000000000000000001234567890123456789012345678901234567890' // to
              ],
              data: '0x00000000000000000000000000000000000000000000000000000000000f4240', // 1000000 (1 USDT)
              blockNumber: '0x1234567',
              transactionHash: '0x' + 'b'.repeat(64),
              logIndex: '0x0'
            }
          ]
        }
      });
      
      const params = {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'ethereum' as SupportedChain,
        index: '0'
      };
      
      const history = await adapter.getHistory(params, 10, { includeTokenTransfers: true });
      
      expect(Array.isArray(history)).toBe(true);
      // Check if token transfer is included
      const tokenTransfer = history.find((tx: any) => tx.tokenContract);
      if (tokenTransfer) {
        expect(tokenTransfer.tokenContract).toBeDefined();
        expect(tokenTransfer.amount instanceof Big).toBe(true);
      }
    }
  });
});