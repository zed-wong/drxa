// src/index.ts
import * as ecc from 'tiny-secp256k1';
import { initEccLib } from 'bitcoinjs-lib';

import { HDWallet } from "./core/HDWallet.js";
import { AdapterRegistry } from "./core/AdapterRegistry.js";
import { ConfigManager } from "./core/config/ConfigManager.js";
import { EventBus } from "./core/events/EventBus.js";
import { 
  SDKConfig, 
  AdapterConfig, 
  SupportedChain, 
  Logger, 
  MetricsCollector,
  ChainConfig
} from "./types/index.js";

// Built-in adapters - these will be registered automatically
import { registerBuiltInAdapters } from './adapters/index.js';

initEccLib(ecc);

export interface WalletSDKOptions {
  /** Your 32-byte Ed25519 master seed */
  seed: Uint8Array | string;

  /** Optional adapter configurations per chain */
  adapters?: {
    [chain in SupportedChain]?: AdapterConfig;
  };

  /** Default configuration for all adapters */
  defaultConfig?: AdapterConfig;

  /** Optional logger instance */
  logger?: Logger;

  /** Optional metrics collector */
  metrics?: MetricsCollector;

  /** Optional chain configuration overrides */
  chainConfigs?: {
    [chain in SupportedChain]?: Partial<ChainConfig>;
  };

  /** Whether to auto-register built-in adapters (default: true) */
  autoRegisterAdapters?: boolean;

  /** Environment to load configuration from (default: production) */
  environment?: 'development' | 'staging' | 'production';
}

export class WalletSDK {
  private readonly seed: Uint8Array;
  private readonly registry: AdapterRegistry;
  private readonly configManager: ConfigManager;
  private readonly eventBus: EventBus;
  private readonly logger?: Logger;
  private readonly metrics?: MetricsCollector;
  private _wallet?: HDWallet;

  constructor(options: WalletSDKOptions) {
    // Parse seed
    if (typeof options.seed === 'string') {
      this.seed = Uint8Array.from(Buffer.from(options.seed, 'hex'));
    } else {
      this.seed = options.seed;
    }

    // Validate seed length
    if (this.seed.length !== 32) {
      throw new Error('Seed must be exactly 32 bytes');
    }

    this.logger = options.logger;
    this.metrics = options.metrics;

    // Initialize core components
    this.eventBus = EventBus.getInstance(this.logger);
    this.configManager = ConfigManager.getInstance();
    this.registry = AdapterRegistry.getInstance(this.logger);

    // Apply chain configuration overrides
    if (options.chainConfigs) {
      for (const [chain, config] of Object.entries(options.chainConfigs)) {
        const existingConfig = this.configManager.getChainConfig(chain as SupportedChain);
        this.configManager.setChainConfig(
          chain as SupportedChain,
          { ...existingConfig, ...config }
        );
      }
    }

    // Load environment configuration
    if (options.environment !== 'production') {
      this.configManager.loadFromEnvironment(`DRXA_${options.environment?.toUpperCase()}_`);
    }

    // Initialize adapter registry
    this.registry.initialize(this.seed, options.defaultConfig);

    // Auto-register built-in adapters
    if (options.autoRegisterAdapters !== false) {
      registerBuiltInAdapters(this.registry);
    }

    this.logger?.info('WalletSDK initialized', {
      environment: options.environment || 'production',
      autoRegisterAdapters: options.autoRegisterAdapters !== false
    });
  }

  /**
   * Get the main wallet instance (lazy-loaded)
   */
  get wallet(): HDWallet {
    if (!this._wallet) {
      this._wallet = new HDWallet(this.seed, this.registry, this.logger, this.metrics);
    }
    return this._wallet;
  }

  /**
   * Create a new wallet instance (same seed, fresh instance)
   */
  createWallet(): HDWallet {
    return new HDWallet(this.seed, this.registry, this.logger, this.metrics);
  }

  /**
   * Get the adapter registry
   */
  getRegistry(): AdapterRegistry {
    return this.registry;
  }

  /**
   * Get the configuration manager
   */
  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  /**
   * Get the event bus
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Load an adapter for a specific chain
   */
  async loadAdapter(chain: SupportedChain, config?: AdapterConfig) {
    return this.registry.loadAdapter(chain, config);
  }

  /**
   * Check if an adapter is available for a chain
   */
  hasAdapter(chain: SupportedChain): boolean {
    return this.registry.hasAdapter(chain);
  }

  /**
   * Get list of supported chains
   */
  getSupportedChains(): SupportedChain[] {
    return this.registry.getRegisteredChains();
  }

  /**
   * Subscribe to events from all chains
   */
  onEvent(handler: (event: any) => void) {
    return this.eventBus.subscribe({}, handler);
  }

  /**
   * Subscribe to events from a specific chain
   */
  onChainEvent(chain: SupportedChain, handler: (event: any) => void) {
    return this.eventBus.subscribeToChain(chain, handler);
  }

  /**
   * Get SDK statistics
   */
  getStats() {
    return {
      registry: this.registry.getStats(),
      eventHistory: this.eventBus.getHistory({}, 10),
      supportedChains: this.getSupportedChains(),
      loadedAdapters: this.registry.getLoadedAdapters().size
    };
  }

  /**
   * Shutdown the SDK and cleanup resources
   */
  async shutdown(): Promise<void> {
    this.logger?.info('Shutting down WalletSDK');
    
    // Unload all adapters
    await this.registry.unloadAll();
    
    // Clear event subscriptions
    this.eventBus.unsubscribeAll();
    
    this.logger?.info('WalletSDK shutdown complete');
  }
}

// Re-export types for convenience
export * from "./types/index.js";
export * from "./core/errors/index.js";
export { EventBus } from "./core/events/EventBus.js";
export { AdapterRegistry } from "./core/AdapterRegistry.js";
export { ConfigManager } from "./core/config/ConfigManager.js";
export { BaseAdapter } from "./core/adapters/BaseAdapter.js";
export { ConnectionPool } from "./core/pool/ConnectionPool.js";
