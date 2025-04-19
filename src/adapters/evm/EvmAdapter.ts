// src/adapters/evm/EvmAdapter.ts
import { IChainAdapter } from "../../interfaces/IChainAdapter.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import { keccak256 } from "js-sha3";
import { BigNumber, providers, Wallet, Contract } from "ethers";
import { getPublicKey as getSecp256k1Pub } from "@noble/secp256k1";
import Big from "big.js";

// Minimal ERC20 ABI for balance and transfer
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)"
];

export interface EvmConfig {
  chainName: string;
  rpcUrl: string;
  wsUrl?: string;
}

const chains = [
  { name: "ethereum", id: 1 },
  { name: "optimism", id: 10 },
  { name: "cronos", id: 25 },
  { name: "bsc", id: 56 },
  { name: "polygon", id: 137 },
  { name: "sonic", id: 146 },
  { name: "fantom", id: 250 },
  { name: "arbitrum", id: 42161 },
  { name: "avalanche", id: 43114 },
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

  private derivePrivateKey(params: DeriveParams): { priv: Uint8Array; address: string } {
    // All EVM chains share the same derivation method
    params.chain = 'ethereum';
    const entropy = deriveEntropy(this.masterSeed, params);
    const priv = entropy.slice(0, 32);
    // Generate secp256k1 public key and compute address
    const pub = getSecp256k1Pub(priv, true);
    const hash = keccak256(pub.slice(1));
    const address = `0x${hash.slice(-40)}`.toLowerCase();
    return { priv, address };
  }

  async deriveAddress(params: DeriveParams): Promise<string> {
    const { address } = this.derivePrivateKey(params);
    return address;
  }

  /**
   * Native token balance (ETH, BNB, etc.)
   */
  async balance(params: DeriveParams): Promise<Big> {
    const { address } = this.derivePrivateKey(params);
    const bal = await this.provider.getBalance(address);
    return Big(bal.toString());
  }

  /**
   * ERC20 token balance for any token contract
   */
  async tokenBalance(params: DeriveParams, tokenContract: string): Promise<Big> {
    const { address } = this.derivePrivateKey(params);
    const contract = new Contract(tokenContract, ERC20_ABI, this.provider);
    const bal: BigNumber = await contract.balanceOf(address);
    return Big(bal.toString());
  }

  /**
   * Send native chain tokens (ETH, BNB, etc.)
   */
  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{ txHash: string }> {
    const { priv } = this.derivePrivateKey(params);
    const wallet = new Wallet(priv, this.provider);
    const tx = await wallet.sendTransaction({
      to,
      value: BigNumber.from(amount.toString()),
    });
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  /**
   * Send ERC20 tokens to recipient
   */
  async sendToken(
    params: DeriveParams,
    tokenContract: string,
    to: string,
    amount: Big
  ): Promise<{ txHash: string }> {
    const { priv } = this.derivePrivateKey(params);
    const wallet = new Wallet(priv, this.provider);
    const contract = new Contract(tokenContract, ERC20_ABI, wallet);
    // Fetch token decimals
    const decimals: number = await contract.decimals();
    const scaled = Big(amount.toString()).times(new Big(10).pow(decimals));
    const value = BigNumber.from(scaled.toFixed(0));
    const tx = await contract.transfer(to, value);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async subscribe(
    address: string,
    onIncoming: (txHash: string, amount: Big) => void
  ): Promise<{ unsubscribe: () => void }> {
    if (!this.wsProvider) {
      throw new Error(`[${this.chainName}] WebSocket URL required for subscribe`);
    }
    let last = await this.provider.getBalance(address);
    const handler = async (block: number) => {
      const bal = await this.provider.getBalance(address);
      if (bal.gt(last)) {
        onIncoming(`block${block}`, Big(bal.sub(last).toString()));
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
    const { http, ws } = getRpcEndpoints(chain.name);
    new EvmAdapter({ chainName: chain.name, rpcUrl: http, wsUrl: ws }, masterSeed);
  });
}
