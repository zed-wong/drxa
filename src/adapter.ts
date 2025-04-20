import { BitcoinAdapter } from "./adapters/bitcoin/BitcoinAdapter.js"
import { EvmAdapter } from "./adapters/evm/EvmAdapter.js";
import { SolanaAdapter } from "./adapters/solana/SolanaAdapter.js";

export const registerAllAdapters = (masterSeed: Uint8Array) => {
  new BitcoinAdapter(masterSeed).registerAdapter();
  new EvmAdapter({chainName: 'ethereum'}, masterSeed).registerAdapter();
  new SolanaAdapter(masterSeed).registerAdapter();
}