import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Big from 'big.js';
import { IChainAdapter, DeriveParams, SupportedChain, TransactionResponse } from '../../types/index.js';
import { AdapterRegistry } from '../../core/AdapterRegistry.js';
import { registerMockAdapters } from './TestAdapters.js';

export interface TestCase {
  name: string;
  deriveParams: DeriveParams;
  expectedAddressPattern?: RegExp;
  minBalance?: Big;
  testSend?: {
    to: string;
    amount: Big;
    shouldFail?: boolean;
    expectedError?: string;
  };
}

export interface MockApiResponse {
  endpoint: string;
  method: 'GET' | 'POST';
  response: any;
  status?: number;
}

export class AdapterTestFramework {
  private registry: AdapterRegistry;
  private masterSeed: Uint8Array;
  private mockResponses: Map<string, MockApiResponse> = new Map();

  constructor() {
    // Use a fixed test seed for deterministic tests
    this.masterSeed = new Uint8Array([
      0x6a, 0xeb, 0x8a, 0xa8, 0x77, 0xe9, 0xbc, 0x8c, 0x26, 0xfc, 0x6a, 0x6d, 0x4d, 0x85, 0x2e, 0x41,
      0xd5, 0x1e, 0x4b, 0xf6, 0x22, 0x66, 0xf1, 0xfa, 0x99, 0x14, 0x06, 0x0a, 0x6b, 0x35, 0xa5, 0xa6
    ]);
    this.registry = AdapterRegistry.getInstance();
    this.registry.initialize(this.masterSeed);
    
    // Register mock adapters for testing
    this.registerTestAdapters();
  }

  private registerTestAdapters(): void {
    // Register mock adapters for testing
    registerMockAdapters(this.registry);
  }

  // Set up mock API responses
  mockApiResponse(key: string, response: MockApiResponse): void {
    this.mockResponses.set(key, response);
  }

  // Create a test suite for a specific chain adapter
  createAdapterTestSuite(
    chain: SupportedChain,
    testCases: TestCase[],
    options: {
      skipNetworkTests?: boolean;
      skipTransactionTests?: boolean;
      customSetup?: () => Promise<void>;
      customTeardown?: () => Promise<void>;
    } = {}
  ) {
    return describe(`${chain.toUpperCase()} Adapter Tests`, () => {
      let adapter: IChainAdapter;

      beforeAll(async () => {
        if (options.customSetup) {
          await options.customSetup();
        }
        
        // Set up network mocks
        this.setupNetworkMocks();
        
        try {
          adapter = await this.registry.loadAdapter(chain);
        } catch (error) {
          console.warn(`Failed to load adapter for ${chain}:`, error);
          throw error;
        }
      });

      afterAll(async () => {
        if (adapter?.shutdown) {
          await adapter.shutdown();
        }
        
        if (options.customTeardown) {
          await options.customTeardown();
        }
        
        this.clearNetworkMocks();
      });

      // Test adapter basic properties
      describe('Adapter Properties', () => {
        it('should have correct chain name', () => {
          expect(adapter.chainName).toBe(chain);
        });

        it('should have valid configuration', () => {
          expect(adapter.config).toBeDefined();
          expect(adapter.config.name).toBeDefined();
          expect(adapter.config.symbol).toBeDefined();
          expect(adapter.config.decimals).toBeGreaterThan(0);
        });
      });

      // Test address derivation
      describe('Address Derivation', () => {
        testCases.forEach((testCase) => {
          it(`should derive valid address for ${testCase.name}`, async () => {
            const address = await adapter.deriveAddress(testCase.deriveParams);
            
            expect(address).toBeDefined();
            expect(typeof address).toBe('string');
            expect(address.length).toBeGreaterThan(0);
            
            if (testCase.expectedAddressPattern) {
              expect(address).toMatch(testCase.expectedAddressPattern);
            }
          });
        });

        it('should derive consistent addresses', async () => {
          const params = testCases[0]?.deriveParams;
          if (!params) return;

          const address1 = await adapter.deriveAddress(params);
          const address2 = await adapter.deriveAddress(params);
          
          expect(address1).toBe(address2);
        });

        it('should derive different addresses for different params', async () => {
          if (testCases.length < 2) return;

          const address1 = await adapter.deriveAddress(testCases[0].deriveParams);
          const address2 = await adapter.deriveAddress(testCases[1].deriveParams);
          
          expect(address1).not.toBe(address2);
        });
      });

      // Test parameter validation
      describe('Parameter Validation', () => {
        it('should reject invalid derive params', async () => {
          const invalidParams = [
            { ...testCases[0]?.deriveParams, scope: '' },
            { ...testCases[0]?.deriveParams, userId: '' },
            { ...testCases[0]?.deriveParams, chain: 'invalid' as SupportedChain },
            { ...testCases[0]?.deriveParams, index: '' },
          ];

          for (const params of invalidParams) {
            await expect(adapter.deriveAddress(params as DeriveParams)).rejects.toThrow();
          }
        });
      });

      // Test balance functionality (with mocks for offline tests)
      if (!options.skipNetworkTests) {
        describe('Balance Operations', () => {
          testCases.forEach((testCase) => {
            it(`should get balance for ${testCase.name}`, async () => {
              const balance = await adapter.balance(testCase.deriveParams);
              
              expect(balance).toBeDefined();
              expect(balance instanceof Big).toBe(true);
              expect(balance.gte(0)).toBe(true);
              
              if (testCase.minBalance) {
                expect(balance.gte(testCase.minBalance)).toBe(true);
              }
            });
          });

          it('should handle balance errors gracefully', async () => {
            // Set error simulation flag
            (globalThis as any).TEST_SIMULATE_NETWORK_ERROR = true;

            try {
              await expect(adapter.balance(testCases[0].deriveParams)).rejects.toThrow();
            } finally {
              delete (globalThis as any).TEST_SIMULATE_NETWORK_ERROR;
            }
          });
        });
      }

      // Test transaction functionality
      if (!options.skipTransactionTests) {
        describe('Transaction Operations', () => {
          testCases.forEach((testCase) => {
            if (!testCase.testSend) return;

            it(`should ${testCase.testSend.shouldFail ? 'fail to send' : 'send'} transaction for ${testCase.name}`, async () => {
              const { to, amount, shouldFail, expectedError } = testCase.testSend!;

              if (shouldFail) {
                await expect(adapter.send(testCase.deriveParams, to, amount)).rejects.toThrow(expectedError);
              } else {
                // Mock successful transaction for testing
                this.mockSuccessfulTransaction(chain);

                const result = await adapter.send(testCase.deriveParams, to, amount);
                
                expect(result).toBeDefined();
                expect(result.txHash).toBeDefined();
                expect(typeof result.txHash).toBe('string');
                expect(result.txHash.length).toBeGreaterThan(0);
              }
            });
          });

          it('should validate transaction parameters', async () => {
            const params = testCases[0]?.deriveParams;
            if (!params) return;

            // Test invalid amounts
            await expect(adapter.send(params, 'invalid-address', new Big(0))).rejects.toThrow();
            await expect(adapter.send(params, 'invalid-address', new Big(-1))).rejects.toThrow();

            // Test empty addresses
            await expect(adapter.send(params, '', new Big(1))).rejects.toThrow();
          });
        });
      }

      // Test optional methods if implemented
      describe('Optional Methods', () => {
        it('should handle estimateFee if implemented', async () => {
          if (adapter.estimateFee) {
            const params = testCases[0]?.deriveParams;
            if (!params) return;

            const fee = await adapter.estimateFee(params, 'test-address', new Big(1));
            expect(fee).toBeDefined();
            expect(fee.totalFee instanceof Big).toBe(true);
            expect(fee.totalFee.gte(0)).toBe(true);
          }
        });

        it('should handle getHistory if implemented', async () => {
          if (adapter.getHistory) {
            const params = testCases[0]?.deriveParams;
            if (!params) return;

            const history = await adapter.getHistory(params, 10);
            expect(Array.isArray(history)).toBe(true);
          }
        });

        it('should handle subscribe if implemented', async () => {
          if (adapter.subscribe) {
            const address = await adapter.deriveAddress(testCases[0].deriveParams);
            const callback = vi.fn();

            const unsubscribe = await adapter.subscribe(address, callback);
            expect(typeof unsubscribe).toBe('function');

            // Clean up
            unsubscribe();
          }
        });
      });

      // Performance tests
      describe('Performance', () => {
        it('should derive addresses quickly', async () => {
          const start = Date.now();
          
          await Promise.all(
            testCases.slice(0, 5).map(testCase => 
              adapter.deriveAddress(testCase.deriveParams)
            )
          );
          
          const duration = Date.now() - start;
          expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });
      });
    });
  }

  // Helper methods for setting up mocks
  private setupNetworkMocks(): void {
    // Mock fetch for API calls
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const key = `${options?.method || 'GET'}:${url}`;
      const mockResponse = this.mockResponses.get(key);

      if (mockResponse) {
        return Promise.resolve({
          ok: mockResponse.status !== undefined ? mockResponse.status < 400 : true,
          status: mockResponse.status || 200,
          json: () => Promise.resolve(mockResponse.response),
          text: () => Promise.resolve(JSON.stringify(mockResponse.response)),
        } as Response);
      }

      // Default mock response for unmocked endpoints
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ balance: '0' }),
        text: () => Promise.resolve('{"balance": "0"}'),
      } as Response);
    });
  }

  private clearNetworkMocks(): void {
    vi.clearAllMocks();
    this.mockResponses.clear();
  }

  private mockSuccessfulTransaction(chain: SupportedChain): void {
    // Mock transaction broadcast endpoints for different chains
    const mockTxHash = '0x' + '1'.repeat(64); // Generic transaction hash

    switch (chain) {
      case 'ethereum':
      case 'bsc':
      case 'polygon':
        this.mockApiResponse('POST:*', {
          endpoint: '*',
          method: 'POST',
          response: { result: mockTxHash },
        });
        break;
      case 'bitcoin':
        this.mockApiResponse('POST:*/tx', {
          endpoint: '*/tx',
          method: 'POST',
          response: mockTxHash,
        });
        break;
      case 'solana':
        this.mockApiResponse('POST:*', {
          endpoint: '*',
          method: 'POST',
          response: { result: mockTxHash },
        });
        break;
      default:
        this.mockApiResponse('POST:*', {
          endpoint: '*',
          method: 'POST',
          response: { hash: mockTxHash, success: true },
        });
    }
  }

  // Utility method to create common test cases
  static createStandardTestCases(chain: SupportedChain): TestCase[] {
    const baseParams = {
      scope: 'wallet',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      chain,
    };

    return [
      {
        name: 'index 0',
        deriveParams: { ...baseParams, index: '0' },
        expectedAddressPattern: AdapterTestFramework.getAddressPattern(chain),
      },
      {
        name: 'index 1',
        deriveParams: { ...baseParams, index: '1' },
        expectedAddressPattern: AdapterTestFramework.getAddressPattern(chain),
      },
      {
        name: 'different scope',
        deriveParams: { ...baseParams, index: '0', scope: 'session' },
        expectedAddressPattern: AdapterTestFramework.getAddressPattern(chain),
      },
      {
        name: 'different user',
        deriveParams: { 
          ...baseParams, 
          index: '0', 
          userId: '987fcdeb-51a2-43d1-b432-fedcba098765' 
        },
        expectedAddressPattern: AdapterTestFramework.getAddressPattern(chain),
      },
    ];
  }

  // Get expected address patterns for different chains
  private static getAddressPattern(chain: SupportedChain): RegExp {
    switch (chain) {
      case 'ethereum':
      case 'bsc':
      case 'polygon':
      case 'avalanche':
      case 'arbitrum':
      case 'optimism':
      case 'cronos':
      case 'sonic':
      case 'base':
        return /^0x[a-fA-F0-9]{40}$/;
      case 'bitcoin':
        return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/;
      case 'solana':
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      case 'cardano':
        return /^addr1[a-z0-9]+$/;
      case 'polkadot':
        return /^1[a-zA-Z0-9]{46,47}$/;
      case 'tron':
        return /^T[A-Za-z0-9]{33}$/;
      default:
        return /.+/; // Generic pattern for unknown chains
    }
  }
}