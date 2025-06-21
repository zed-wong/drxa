import { AdapterRegistry, AdapterConstructor } from "../core/AdapterRegistry.js";
import { ConfigManager } from "../core/config/ConfigManager.js";

// Import the new V2 adapters
import { BitcoinAdapterV2 } from "./bitcoin/BitcoinAdapterV2.js";
import { EvmAdapterV2, createEvmAdapter } from "./evm/EvmAdapterV2.js";
import { AptosAdapterV2 } from "./aptos/AptosAdapterV2.js";
import { TonAdapter } from "./ton/TonAdapter.js";
import { NearAdapter } from "./near/NearAdapter.js";
import { SolanaAdapter } from "./solana/SolanaAdapter.js";
import { PolkadotAdapter } from "./polkadot/PolkadotAdapter.js";
import { TronAdapter } from "./tron/TronAdapter.js";

// Create adapter constructor wrappers for the registry
class BitcoinAdapterConstructor {
  static readonly chainName = 'bitcoin' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new BitcoinAdapterV2(masterSeed, config, logger, metrics);
  }
}

class EthereumAdapterConstructor {
  static readonly chainName = 'ethereum' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    const configManager = ConfigManager.getInstance();
    const chainConfig = configManager.getChainConfig('ethereum');
    return createEvmAdapter('ethereum', chainConfig, masterSeed, config, logger, metrics);
  }
}

class BSCAdapterConstructor {
  static readonly chainName = 'bsc' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    const configManager = ConfigManager.getInstance();
    const chainConfig = configManager.getChainConfig('bsc');
    return createEvmAdapter('bsc', chainConfig, masterSeed, config, logger, metrics);
  }
}

class AptosAdapterConstructor {
  static readonly chainName = 'aptos' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new AptosAdapterV2(masterSeed, config, logger, metrics);
  }
}

class TonAdapterConstructor {
  static readonly chainName = 'ton' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new TonAdapter(masterSeed, config, logger, metrics);
  }
}


class NearAdapterConstructor {
  static readonly chainName = 'near' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new NearAdapter(masterSeed, config, logger, metrics);
  }
}

class SolanaAdapterConstructor {
  static readonly chainName = 'solana' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new SolanaAdapter(masterSeed);
  }
}

class PolkadotAdapterConstructor {
  static readonly chainName = 'polkadot' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new PolkadotAdapter(masterSeed, config);
  }
}

class TronAdapterConstructor {
  static readonly chainName = 'tron' as const;
  
  constructor(
    masterSeed: Uint8Array,
    config?: any,
    logger?: any,
    metrics?: any
  ) {
    return new TronAdapter(masterSeed, config);
  }
}

export function registerBuiltInAdapters(registry: AdapterRegistry): void {
  console.log('Registering built-in adapters...');
  
  try {
    // Register V2 adapters
    registry.registerAdapter(BitcoinAdapterConstructor as any);
    registry.registerAdapter(EthereumAdapterConstructor as any);
    registry.registerAdapter(BSCAdapterConstructor as any);
    registry.registerAdapter(AptosAdapterConstructor as any);
    registry.registerAdapter(TonAdapterConstructor as any);
    registry.registerAdapter(NearAdapterConstructor as any);
    registry.registerAdapter(SolanaAdapterConstructor as any);
    registry.registerAdapter(PolkadotAdapterConstructor as any);
    registry.registerAdapter(TronAdapterConstructor as any);
    
    // Create EVM adapter constructors for other chains
    const evmChains = ['polygon', 'avalanche', 'arbitrum', 'optimism', 'cronos', 'sonic', 'base'];
    
    for (const chain of evmChains) {
      const AdapterConstructor = class {
        static readonly chainName = chain;
        
        constructor(
          masterSeed: Uint8Array,
          config?: any,
          logger?: any,
          metrics?: any
        ) {
          const configManager = ConfigManager.getInstance();
          try {
            const chainConfig = configManager.getChainConfig(chain as any);
            return createEvmAdapter(chain as any, chainConfig, masterSeed, config, logger, metrics);
          } catch (error) {
            console.warn(`Chain ${chain} not configured, skipping registration`);
            throw error;
          }
        }
      };
      
      try {
        registry.registerAdapter(AdapterConstructor as any);
      } catch (error) {
        console.warn(`Failed to register adapter for ${chain}:`, error);
      }
    }
    
    console.log('Built-in adapters registered successfully');
  } catch (error) {
    console.error('Failed to register some built-in adapters:', error);
  }
}

// Export types for external adapter development
export { AdapterRegistry } from "../core/AdapterRegistry.js";
export { BaseAdapter } from "../core/adapters/BaseAdapter.js";
export type { AdapterConstructor } from "../core/AdapterRegistry.js";

// Re-export the new adapters
export { BitcoinAdapterV2 } from "./bitcoin/BitcoinAdapterV2.js";
export { EvmAdapterV2, createEvmAdapter } from "./evm/EvmAdapterV2.js";
export { AptosAdapterV2 } from "./aptos/AptosAdapterV2.js";
export { TonAdapter } from "./ton/TonAdapter.js";
export { NearAdapter } from "./near/NearAdapter.js";
export { SolanaAdapter } from "./solana/SolanaAdapter.js";
export { PolkadotAdapter } from "./polkadot/PolkadotAdapter.js";
export { TronAdapter } from "./tron/TronAdapter.js";

// Example of what an external adapter package would export:
export interface ExternalAdapterPackage {
  name: string;
  version: string;
  adapters: AdapterConstructor[];
}