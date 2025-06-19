import { ChainConfig, SupportedChain, isValidChain } from "../../types/index.js";
import { ConfigurationError, ErrorCode } from "../errors/index.js";

export interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    default?: any;
    validate?: (value: any) => boolean;
    description?: string;
  };
}

export class ConfigManager {
  private static instance: ConfigManager;
  private configs = new Map<SupportedChain, ChainConfig>();
  private schemas = new Map<string, ConfigSchema>();
  private overrides = new Map<string, any>();

  private constructor() {
    this.loadDefaultConfigs();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  // Register a configuration schema
  registerSchema(name: string, schema: ConfigSchema): void {
    this.schemas.set(name, schema);
  }

  // Set configuration for a chain
  setChainConfig(chain: SupportedChain, config: ChainConfig): void {
    this.validateChainConfig(config);
    this.configs.set(chain, config);
  }

  // Get configuration for a chain
  getChainConfig(chain: SupportedChain): ChainConfig {
    const config = this.configs.get(chain);
    if (!config) {
      throw new ConfigurationError(
        ErrorCode.MISSING_CONFIG,
        `Configuration not found for chain: ${chain}`
      );
    }
    return this.applyOverrides(chain, config);
  }

  // Set runtime override
  setOverride(key: string, value: any): void {
    this.overrides.set(key, value);
  }

  // Remove override
  removeOverride(key: string): void {
    this.overrides.delete(key);
  }

  // Load configuration from environment variables
  loadFromEnvironment(prefix = 'DRXA_'): void {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const configKey = key.substring(prefix.length).toLowerCase().replace(/_/g, '.');
        this.setOverride(configKey, this.parseEnvValue(value));
      }
    }
  }

  // Validate configuration against schema
  validateConfig(config: any, schemaName: string): void {
    const schema = this.schemas.get(schemaName);
    if (!schema) {
      throw new ConfigurationError(
        ErrorCode.INVALID_CONFIG,
        `Schema '${schemaName}' not found`
      );
    }

    for (const [field, definition] of Object.entries(schema)) {
      const value = config[field];

      // Check required fields
      if (definition.required && (value === undefined || value === null)) {
        throw new ConfigurationError(
          ErrorCode.INVALID_CONFIG,
          `Required field '${field}' is missing`
        );
      }

      // Skip validation if value is undefined and not required
      if (value === undefined) {
        continue;
      }

      // Type validation
      if (!this.validateType(value, definition.type)) {
        throw new ConfigurationError(
          ErrorCode.INVALID_CONFIG,
          `Field '${field}' must be of type ${definition.type}`
        );
      }

      // Custom validation
      if (definition.validate && !definition.validate(value)) {
        throw new ConfigurationError(
          ErrorCode.INVALID_CONFIG,
          `Field '${field}' failed custom validation`
        );
      }
    }
  }

  // Get all configurations
  getAllConfigs(): Map<SupportedChain, ChainConfig> {
    return new Map(this.configs);
  }

  // Get supported chains
  getSupportedChains(): SupportedChain[] {
    return Array.from(this.configs.keys());
  }

  // Private methods

  private loadDefaultConfigs(): void {
    // Ethereum mainnet
    this.setChainConfig('ethereum', {
      chainId: 1,
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: 'https://eth.llamarpc.com',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        },
        ws: {
          url: 'wss://mainnet.gateway.tenderly.co',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://etherscan.io',
        apiUrl: 'https://api.etherscan.io/api'
      },
      feeConfig: {
        type: 'eip1559'
      }
    });

    // Bitcoin mainnet
    this.setChainConfig('bitcoin', {
      name: 'Bitcoin',
      symbol: 'BTC',
      decimals: 8,
      category: 'utxo',
      endpoints: {
        http: {
          url: 'https://blockstream.info/api',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://blockstream.info',
        apiUrl: 'https://blockstream.info/api'
      },
      feeConfig: {
        type: 'dynamic'
      }
    });

    // Solana mainnet
    this.setChainConfig('solana', {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
      category: 'account',
      endpoints: {
        http: {
          url: 'https://api.mainnet-beta.solana.com',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        },
        ws: {
          url: 'wss://api.mainnet-beta.solana.com',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://explorer.solana.com',
        apiUrl: 'https://public-api.solscan.io'
      },
      feeConfig: {
        type: 'fixed'
      }
    });

    // BSC
    this.setChainConfig('bsc', {
      chainId: 56,
      name: 'BNB Smart Chain',
      symbol: 'BNB',
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: 'https://bsc-dataseed.binance.org/',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://bscscan.com',
        apiUrl: 'https://api.bscscan.com/api'
      },
      feeConfig: {
        type: 'dynamic'
      }
    });

    // Polygon
    this.setChainConfig('polygon', {
      chainId: 137,
      name: 'Polygon',
      symbol: 'MATIC',
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: 'https://polygon-bor-rpc.publicnode.com',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://polygonscan.com',
        apiUrl: 'https://api.polygonscan.com/api'
      },
      feeConfig: {
        type: 'eip1559'
      }
    });

    // Cronos
    this.setChainConfig('cronos', {
      chainId: 25,
      name: 'Cronos',
      symbol: 'CRO',
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: 'https://evm.cronos.org',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://cronoscan.com',
        apiUrl: 'https://api.cronoscan.com/api'
      },
      feeConfig: {
        type: 'dynamic'
      }
    });

    // Avalanche
    this.setChainConfig('avalanche', {
      chainId: 43114,
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: 'https://api.avax.network/ext/bc/C/rpc',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://snowtrace.io',
        apiUrl: 'https://api.snowtrace.io/api'
      },
      feeConfig: {
        type: 'eip1559'
      }
    });

    // Optimism
    this.setChainConfig('optimism', {
      chainId: 10,
      name: 'Optimism',
      symbol: 'ETH',
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: 'https://mainnet.optimism.io',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://optimistic.etherscan.io',
        apiUrl: 'https://api-optimistic.etherscan.io/api'
      },
      feeConfig: {
        type: 'eip1559'
      }
    });

    // Arbitrum
    this.setChainConfig('arbitrum', {
      chainId: 42161,
      name: 'Arbitrum One',
      symbol: 'ETH',
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: 'https://arb1.arbitrum.io/rpc',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://arbiscan.io',
        apiUrl: 'https://api.arbiscan.io/api'
      },
      feeConfig: {
        type: 'eip1559'
      }
    });

    // Sonic
    this.setChainConfig('sonic', {
      chainId: 146,
      name: 'Sonic',
      symbol: 'S',
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: 'https://rpc.soniclabs.com',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://sonicscan.org',
        apiUrl: 'https://api.sonicscan.org/api'
      },
      feeConfig: {
        type: 'eip1559'
      }
    });

    // Tron
    this.setChainConfig('tron', {
      name: 'Tron',
      symbol: 'TRX',
      decimals: 6,
      category: 'other',
      endpoints: {
        http: {
          url: 'https://api.trongrid.io',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://tronscan.org',
        apiUrl: 'https://api.tronscan.org/api'
      },
      feeConfig: {
        type: 'dynamic'
      }
    });

    // Polkadot
    this.setChainConfig('polkadot', {
      name: 'Polkadot',
      symbol: 'DOT',
      decimals: 10,
      category: 'other',
      endpoints: {
        http: {
          url: 'https://rpc.polkadot.io',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        },
        ws: {
          url: 'wss://rpc.polkadot.io',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        }
      },
      explorer: {
        url: 'https://polkadot.subscan.io',
        apiUrl: 'https://polkadot.api.subscan.io'
      },
      feeConfig: {
        type: 'dynamic'
      }
    });
  }

  private validateChainConfig(config: ChainConfig): void {
    if (!config.name || typeof config.name !== 'string') {
      throw new ConfigurationError(
        ErrorCode.INVALID_CONFIG,
        'Chain name is required and must be a string'
      );
    }

    if (!config.symbol || typeof config.symbol !== 'string') {
      throw new ConfigurationError(
        ErrorCode.INVALID_CONFIG,
        'Chain symbol is required and must be a string'
      );
    }

    if (typeof config.decimals !== 'number' || config.decimals < 0) {
      throw new ConfigurationError(
        ErrorCode.INVALID_CONFIG,
        'Chain decimals must be a non-negative number'
      );
    }

    if (!config.category || !['evm', 'utxo', 'account', 'other'].includes(config.category)) {
      throw new ConfigurationError(
        ErrorCode.INVALID_CONFIG,
        'Chain category must be one of: evm, utxo, account, other'
      );
    }

    if (!config.endpoints?.http) {
      throw new ConfigurationError(
        ErrorCode.INVALID_CONFIG,
        'HTTP endpoint is required'
      );
    }

    // Validate HTTP endpoint URL
    const httpEndpoint = Array.isArray(config.endpoints.http) 
      ? config.endpoints.http[0] 
      : config.endpoints.http;
    
    if (!httpEndpoint?.url) {
      throw new ConfigurationError(
        ErrorCode.INVALID_CONFIG,
        'HTTP endpoint URL is required'
      );
    }
  }

  private applyOverrides(chain: SupportedChain, config: ChainConfig): ChainConfig {
    const result = { ...config };
    
    for (const [key, value] of this.overrides) {
      if (key.startsWith(`${chain}.`)) {
        const path = key.substring(chain.length + 1).split('.');
        this.setNestedValue(result, path, value);
      }
    }

    return result;
  }

  private setNestedValue(obj: any, path: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (!(path[i] in current)) {
        current[path[i]] = {};
      }
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
  }

  private parseEnvValue(value: string | undefined): any {
    if (!value) return undefined;

    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Return as string if JSON parsing fails
      return value;
    }
  }

  private validateType(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return false;
    }
  }
}