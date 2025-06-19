import { describe, it, expect, beforeAll, vi } from 'vitest';
import Big from 'big.js';
import { AdapterTestFramework } from './AdapterTestFramework.js';
import { SupportedChain } from '../../types/index.js';

const framework = new AdapterTestFramework();

// Bitcoin-specific test cases
const testCases = [
  ...AdapterTestFramework.createStandardTestCases('bitcoin'),
  {
    name: 'high index',
    deriveParams: {
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain: 'bitcoin' as SupportedChain,
      index: '999'
    },
    expectedAddressPattern: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/,
  }
];

// Mock Bitcoin API responses
beforeAll(() => {
  // Mock Blockstream API responses
  framework.mockApiResponse('GET:https://blockstream.info/api/address/*/utxo', {
    endpoint: 'https://blockstream.info/api/address/*/utxo',
    method: 'GET',
    response: [
      {
        txid: 'mock_txid_1',
        vout: 0,
        value: 100000, // 0.001 BTC in satoshis
        status: { confirmed: true, block_height: 800000 }
      }
    ]
  });

  framework.mockApiResponse('GET:https://blockstream.info/api/address/*/balance', {
    endpoint: 'https://blockstream.info/api/address/*/balance',
    method: 'GET',
    response: { confirmed: 100000, unconfirmed: 0 }
  });

  framework.mockApiResponse('POST:https://blockstream.info/api/tx', {
    endpoint: 'https://blockstream.info/api/tx',
    method: 'POST',
    response: 'mock_transaction_hash_64_chars_long_bitcoin_network_response'
  });

  framework.mockApiResponse('GET:https://blockstream.info/api/fee-estimates', {
    endpoint: 'https://blockstream.info/api/fee-estimates',
    method: 'GET',
    response: { '1': 50, '6': 25, '144': 10 }
  });
});

framework.createAdapterTestSuite('bitcoin', testCases, {
  skipNetworkTests: false,
  skipTransactionTests: false,
});

describe('Bitcoin-specific functionality', () => {
  it('should handle P2TR (Taproot) addresses', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('bitcoin');
    
    const address = await adapter.deriveAddress({
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain: 'bitcoin',
      index: '0'
    });

    // Bitcoin adapter should generate Taproot addresses (bc1p...)
    expect(address).toMatch(/^bc1p[a-z0-9]{58}$/);
  });

  it('should calculate fees correctly', async () => {
    const framework = new AdapterTestFramework();
    const adapter = await framework['registry'].loadAdapter('bitcoin');
    
    if (adapter.estimateFee) {
      const fee = await adapter.estimateFee(
        {
          scope: 'wallet',
          userId: '123e4567-e89b-12d3-a456-426614174000',
          chain: 'bitcoin',
          index: '0'
        },
        'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
        new Big(50000) // 0.0005 BTC
      );

      expect(fee.totalFee.gt(0)).toBe(true);
      // Fee should be reasonable (not more than 0.001 BTC for small transaction)
      expect(fee.totalFee.lt(100000)).toBe(true);
    }
  });

  it('should handle UTXO selection properly', async () => {
    // This would require mocking the UTXO response with multiple UTXOs
    const framework = new AdapterTestFramework();
    
    // Mock multiple UTXOs
    framework.mockApiResponse('GET:https://blockstream.info/api/address/*/utxo', {
      endpoint: 'https://blockstream.info/api/address/*/utxo',
      method: 'GET',
      response: [
        {
          txid: 'utxo1',
          vout: 0,
          value: 50000,
          status: { confirmed: true, block_height: 800000 }
        },
        {
          txid: 'utxo2',
          vout: 1,
          value: 75000,
          status: { confirmed: true, block_height: 800001 }
        }
      ]
    });

    const adapter = await framework['registry'].loadAdapter('bitcoin');
    
    // This should work with the mocked UTXOs
    const result = await adapter.send(
      {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'bitcoin',
        index: '0'
      },
      'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
      new Big(100000) // Amount that requires both UTXOs
    );

    expect(result.txHash).toBeDefined();
  });

  it('should handle insufficient balance gracefully', async () => {
    const framework = new AdapterTestFramework();
    
    // Mock insufficient balance
    framework.mockApiResponse('GET:https://blockstream.info/api/address/*/utxo', {
      endpoint: 'https://blockstream.info/api/address/*/utxo',
      method: 'GET',
      response: []
    });

    const adapter = await framework['registry'].loadAdapter('bitcoin');
    
    await expect(adapter.send(
      {
        scope: 'wallet',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        chain: 'bitcoin',
        index: '0'
      },
      'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
      new Big('200000000') // 2 BTC > 1 BTC balance
    )).rejects.toThrow(/insufficient/i);
  });
});