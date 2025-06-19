import { AdapterRegistry, AdapterConstructor } from "../core/AdapterRegistry.js";

// Import built-in adapters - these would be actual imports in a real implementation
// For now, we'll create placeholder registrations

export function registerBuiltInAdapters(registry: AdapterRegistry): void {
  // Note: In the actual implementation, you would import the real adapter classes
  // and register them here. For this refactoring demo, we're showing the structure.
  
  console.log('Registering built-in adapters...');
  
  // Example of how adapters would be registered:
  // registry.registerAdapter(EthereumAdapter);
  // registry.registerAdapter(BitcoinAdapter);
  // registry.registerAdapter(SolanaAdapter);
  // registry.registerAdapter(CardanoAdapter);
  // registry.registerAdapter(AptosAdapter);
  // registry.registerAdapter(PolkadotAdapter);
  // registry.registerAdapter(SuiAdapter);
  // registry.registerAdapter(TronAdapter);
  
  // The adapters would need to be updated to extend BaseAdapter
  // and implement the new IChainAdapter interface
}

// Export types for external adapter development
export { AdapterRegistry, AdapterConstructor } from "../core/AdapterRegistry.js";
export { BaseAdapter, IChainAdapter } from "../core/adapters/BaseAdapter.js";

// Example of what an external adapter package would export:
export interface ExternalAdapterPackage {
  name: string;
  version: string;
  adapters: AdapterConstructor[];
}