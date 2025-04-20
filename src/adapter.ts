import { AptosAdapter } from "./adapters/aptos/AptosAdapter.js";
import { BitcoinAdapter } from "./adapters/bitcoin/BitcoinAdapter.js"
import { CardanoAdapter } from "./adapters/cardano/CardanoAdapter.js";
import { EvmAdapter } from "./adapters/evm/EvmAdapter.js";
import { PolkadotAdapter } from "./adapters/polkadot/PolkadotAdapter.js";
import { SolanaAdapter } from "./adapters/solana/SolanaAdapter.js";
import { TronAdapter } from "./adapters/tron/TronAdapter.js";

export const registerAllAdapters = (masterSeed: Uint8Array) => {
  new BitcoinAdapter(masterSeed)
  new EvmAdapter(masterSeed).registerAllEVMAdapters();
  new SolanaAdapter(masterSeed)
  new TronAdapter(masterSeed);
  new AptosAdapter(masterSeed);
  new PolkadotAdapter(masterSeed);
  new CardanoAdapter(masterSeed);
}