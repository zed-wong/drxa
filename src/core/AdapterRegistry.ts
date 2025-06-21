import { IChainAdapter, SupportedChain, Logger, AdapterConfig } from "../types/index.js";
import { ErrorFactory } from "./errors/index.js";
import { EventBus } from "./events/EventBus.js";

export interface AdapterConstructor {
  new (
    masterSeed: Uint8Array,
    config?: AdapterConfig,
    logger?: Logger
  ): IChainAdapter;
  readonly chainName: SupportedChain;
}

export interface AdapterPlugin {
  name: string;
  version: string;
  chains: SupportedChain[];
  adapters: AdapterConstructor[];
}

export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private readonly adapters = new Map<SupportedChain, AdapterConstructor>();
  private readonly instances = new Map<SupportedChain, IChainAdapter>();
  private readonly plugins = new Map<string, AdapterPlugin>();
  private readonly logger?: Logger;
  private readonly eventBus: EventBus;
  private masterSeed?: Uint8Array;
  private defaultConfig?: AdapterConfig;

  private constructor(logger?: Logger) {
    this.logger = logger;
    this.eventBus = EventBus.getInstance(logger);
  }

  static getInstance(logger?: Logger): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry(logger);
    }
    return AdapterRegistry.instance;
  }

  // Initialize the registry with master seed and default config
  initialize(masterSeed: Uint8Array, defaultConfig?: AdapterConfig): void {
    this.masterSeed = masterSeed;
    this.defaultConfig = defaultConfig;
    this.logger?.info('AdapterRegistry initialized');
  }

  // Register a single adapter
  registerAdapter(AdapterClass: AdapterConstructor): void {
    const chainName = AdapterClass.chainName;
    
    if (this.adapters.has(chainName)) {
      this.logger?.warn(`Adapter for chain '${chainName}' already registered, overwriting`);
    }

    this.adapters.set(chainName, AdapterClass);
    this.logger?.info(`Adapter registered for chain: ${chainName}`);
    
    // Clear any existing instance
    if (this.instances.has(chainName)) {
      const instance = this.instances.get(chainName)!;
      instance.shutdown?.().catch(err => 
        this.logger?.error('Error shutting down adapter', err, { chain: chainName })
      );
      this.instances.delete(chainName);
    }
  }

  // Register multiple adapters at once
  registerAdapters(adapters: AdapterConstructor[]): void {
    for (const adapter of adapters) {
      this.registerAdapter(adapter);
    }
  }

  // Register a plugin
  registerPlugin(plugin: AdapterPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }

    this.plugins.set(plugin.name, plugin);
    this.registerAdapters(plugin.adapters);
    
    this.logger?.info(`Plugin '${plugin.name}' registered with ${plugin.adapters.length} adapters`);
  }

  // Lazy load an adapter by chain name
  async loadAdapter(chain: SupportedChain, config?: AdapterConfig): Promise<IChainAdapter> {
    // Try to load from npm package if not registered
    if (!this.adapters.has(chain) && !this.instances.has(chain)) {
      await this.tryLoadFromPackage(chain);
    }

    // Return existing instance if available
    if (this.instances.has(chain)) {
      return this.instances.get(chain)!;
    }

    // Create new instance
    const AdapterClass = this.adapters.get(chain);
    if (!AdapterClass) {
      throw ErrorFactory.adapterNotFound(chain);
    }

    if (!this.masterSeed) {
      throw new Error('AdapterRegistry not initialized. Call initialize() first.');
    }

    const adapterConfig = { ...this.defaultConfig, ...config };
    const instance = new AdapterClass(this.masterSeed, adapterConfig, this.logger);
    
    // Initialize the adapter
    if (instance.initialize) {
      await instance.initialize();
    }

    // Connect to event bus
    this.connectAdapterToEventBus(instance);

    this.instances.set(chain, instance);
    this.logger?.info(`Adapter instance created for chain: ${chain}`);

    return instance;
  }

  // Get adapter without creating instance
  getAdapter(chain: SupportedChain): IChainAdapter | undefined {
    return this.instances.get(chain);
  }

  // Check if adapter is registered
  hasAdapter(chain: SupportedChain): boolean {
    return this.adapters.has(chain) || this.instances.has(chain);
  }

  // Get all registered chains
  getRegisteredChains(): SupportedChain[] {
    return Array.from(new Set([
      ...this.adapters.keys(),
      ...this.instances.keys()
    ]));
  }

  // Get all loaded adapter instances
  getLoadedAdapters(): Map<SupportedChain, IChainAdapter> {
    return new Map(this.instances);
  }

  // Unload an adapter
  async unloadAdapter(chain: SupportedChain): Promise<void> {
    const instance = this.instances.get(chain);
    if (instance) {
      await instance.shutdown?.();
      this.instances.delete(chain);
      this.logger?.info(`Adapter unloaded for chain: ${chain}`);
    }
  }

  // Unload all adapters
  async unloadAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [chain, instance] of this.instances) {
      if (instance.shutdown) {
        promises.push(
          instance.shutdown()
            .catch(err => this.logger?.error('Error shutting down adapter', err, { chain }))
        );
      }
    }

    await Promise.all(promises);
    this.instances.clear();
    this.logger?.info('All adapters unloaded');
  }

  // Try to dynamically load adapter from npm package
  private async tryLoadFromPackage(chain: SupportedChain): Promise<void> {
    const packageName = `@drxa/adapter-${chain}`;
    
    try {
      this.logger?.debug(`Attempting to load adapter from package: ${packageName}`);
      
      // Dynamic import
      const module = await import(packageName);
      
      if (module.default && 'chainName' in module.default) {
        this.registerAdapter(module.default as AdapterConstructor);
      } else if (module.AdapterPlugin) {
        this.registerPlugin(module.AdapterPlugin as AdapterPlugin);
      } else {
        throw new Error(`Invalid adapter package format for ${packageName}`);
      }
      
      this.logger?.info(`Successfully loaded adapter from package: ${packageName}`);
    } catch (error) {
      this.logger?.debug(`Failed to load adapter package: ${packageName}`, { error });
      // Not an error - adapter might be built-in
    }
  }

  // Connect adapter to event bus
  private connectAdapterToEventBus(adapter: IChainAdapter): void {
    // Forward adapter events to event bus
    if ('on' in adapter && typeof adapter.on === 'function') {
      const eventEmitter = adapter as any;
      
      eventEmitter.on('transaction', (data: any) => {
        this.eventBus.publish(EventBus.createTransactionEvent(
          adapter.chainName,
          'adapter',
          data
        ));
      });

      eventEmitter.on('error', (error: Error, context?: any) => {
        this.eventBus.publish(EventBus.createErrorEvent(
          adapter.chainName,
          'adapter',
          error,
          context
        ));
      });

      eventEmitter.on('status', (status: any, details?: string) => {
        this.eventBus.publish(EventBus.createStatusEvent(
          adapter.chainName,
          'adapter',
          status,
          details
        ));
      });
    }
  }

  // Get registry stats
  getStats(): {
    registeredAdapters: number;
    loadedAdapters: number;
    plugins: number;
    chains: SupportedChain[];
  } {
    return {
      registeredAdapters: this.adapters.size,
      loadedAdapters: this.instances.size,
      plugins: this.plugins.size,
      chains: this.getRegisteredChains()
    };
  }
}