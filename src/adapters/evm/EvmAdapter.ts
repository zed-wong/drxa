// src/adapters/evm/EvmAdapter.ts
import { IChainAdapter } from "../../interfaces/IChainAdapter.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import { keccak256 } from "js-sha3";
import { providers, Wallet, BigNumber } from "ethers";
import { getPublicKey as getSecp256k1Pub } from "@noble/secp256k1";

export interface EvmConfig {
  chainName: string;
  rpcUrl: string;
  wsUrl?: string;
}

const chains = [
  "ethereum","bsc","cronos","polygon",
  "avalanche","fantom","optimism","arbitrum"
];

export class EvmAdapter implements IChainAdapter {
  readonly chainName: string;
  protected provider: providers.JsonRpcProvider;
  protected wsProvider?: providers.WebSocketProvider;
  private masterSeed: Uint8Array;

  constructor(config: EvmConfig, masterSeed: Uint8Array) {
    this.chainName = config.chainName;
    this.masterSeed = masterSeed;
    this.provider = new providers.JsonRpcProvider(config.rpcUrl);
    if (config.wsUrl) {
      this.wsProvider = new providers.WebSocketProvider(config.wsUrl);
    }
    ChainManager.register(this);
  }

  derivePrivateKey(params: DeriveParams): { priv: Uint8Array; address: string } {
    const entropy = deriveEntropy(this.masterSeed, params);
    const priv = entropy.slice(0, 32); // use first 32 bytes as seed

    // secp256k1: generate public key, remove prefix, then hash via keccak256
    const pub = getSecp256k1Pub(priv, true);
    const hash = keccak256(pub.slice(1));
    const address = `0x${hash.slice(-40)}`;

    return { priv, address };
  }

  async deriveAddress(params: DeriveParams): Promise<string> {
    const { address } = this.derivePrivateKey(params);
    return address;
  }

  async send(
    path: string,
    to: string,
    amount: number
  ): Promise<{ txHash: string }> {
    const { priv } = this.derivePrivateKey({
      scope: "wallet",
      userId: "default",
      chain: this.chainName,
      index: path
    });
    const wallet = new Wallet(priv, this.provider);
    const tx = await wallet.sendTransaction({ to, value: BigNumber.from(amount) });
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async subscribe(
    address: string,
    onIncoming: (txHash: string, amount: number) => void
  ): Promise<{ unsubscribe: () => void }> {
    if (!this.wsProvider) {
      throw new Error(`[${this.chainName}] WebSocket URL required for subscribe`);
    }
    let last = await this.provider.getBalance(address);
    const handler = async (block: number) => {
      const bal = await this.provider.getBalance(address);
      if (bal.gt(last)) {
        onIncoming(`block${block}`, parseInt(bal.sub(last).toString(), 10));
      }
      last = bal;
    };
    this.wsProvider.on("block", handler);
    return { unsubscribe: () => this.wsProvider!.off("block", handler) };
  }
}

/**
 * Register all configured EVM-compatible chains at runtime.
 * Must be called after any rpc overrides are set.
 */
export function registerEvmAdapters(masterSeed: Uint8Array) {
  chains.forEach((chain) => {
    const { http, ws } = getRpcEndpoints(chain);
    new EvmAdapter({ chainName: chain, rpcUrl: http, wsUrl: ws }, masterSeed);
  });
}