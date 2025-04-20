import { IChainAdapter } from "../../interfaces/IChainAdapter.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints, SUPPORTED_EVM_CHAINS } from "../../constants/config.js";
import Big from "big.js";
import { keccak256 } from "js-sha3";
import { BigNumber, providers, Wallet, Contract } from "ethers";
import { getPublicKey as getSecp256k1Pub } from "@noble/secp256k1";

// Minimal ERC20 ABI for balance and transfer
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)",
];

export interface EvmConfig {
  chainName: string;
  chainId?: string | number;
  rpcUrl?: string;
  wsUrl?: string;
  /** Required for getHistory */
  explorerApiKey?: string;
}

export class EvmAdapter implements IChainAdapter {
  public readonly chainName: string;
  public readonly chainId: number;
  private readonly config: EvmConfig;
  protected provider: providers.JsonRpcProvider;
  protected wsProvider: providers.WebSocketProvider;
  private masterSeed: Uint8Array;

  constructor(config: EvmConfig, masterSeed: Uint8Array) {
    const rpcEndpoints = getRpcEndpoints(config.chainName);
    if (!rpcEndpoints) {
      throw new Error(`RPC endpoints not found for chain ${config.chainName}`);
    }
    this.config = config;
    this.chainName = config.chainName;

    // Determine chain ID: prefer config.chainId, otherwise use default RPC config
    this.chainId = config.chainId !== undefined
      ? Number(config.chainId)
      : Number(rpcEndpoints.chainId);
    this.masterSeed = masterSeed;

    // Pass explicit network object to avoid auto-detect network failure
    this.provider = new providers.JsonRpcProvider(
      config.rpcUrl || rpcEndpoints.http,
      { name: this.chainName, chainId: this.chainId }
    );
    this.wsProvider = new providers.WebSocketProvider(
      config.wsUrl || rpcEndpoints.ws || "",
      { name: this.chainName, chainId: this.chainId }
    );

    ChainManager.register(this);
  }

  derivePrivateKey(params: DeriveParams): { priv: Uint8Array; address: string } {
    params.chain = "ethereum";
    const entropy = deriveEntropy(this.masterSeed, params);
    const priv = entropy.slice(0, 32);
    const pub = getSecp256k1Pub(priv, true);
    const hash = keccak256(pub.slice(1));
    const address = `0x${hash.slice(-40)}`.toLowerCase();
    return { priv, address };
  }

  async deriveAddress(params: DeriveParams): Promise<string> {
    return this.derivePrivateKey(params).address;
  }

  async balance(params: DeriveParams): Promise<Big> {
    const { address } = this.derivePrivateKey(params);
    const bal = await this.provider.getBalance(address);
    return Big(bal.toString());
  }

  async tokenBalance(params: DeriveParams, tokenContract: string): Promise<Big> {
    const { address } = this.derivePrivateKey(params);
    const contract = new Contract(tokenContract, ERC20_ABI, this.provider);
    const bal: BigNumber = await contract.balanceOf(address);
    return Big(bal.toString());
  }

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

  async sendToken(
    params: DeriveParams,
    to: string,
    amount: Big,
    tokenContract: string,
  ): Promise<{ txHash: string }> {
    const { priv } = this.derivePrivateKey(params);
    const wallet = new Wallet(priv, this.provider);
    const contract = new Contract(tokenContract, ERC20_ABI, wallet);
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
    let last = await this.provider.getBalance(address);
    const handler = async (block: number) => {
      const bal = await this.provider.getBalance(address);
      if (bal.gt(last)) {
        onIncoming(`block${block}`, Big(bal.sub(last).toString()));
      }
      last = bal;
    };
    this.wsProvider.on("block", handler);
    return { unsubscribe: () => this.wsProvider.off("block", handler) };
  }

  /**
   * Estimate transaction fee in native token units
   */
  async estimateFee(
    params: DeriveParams,
    to: string,
    amount: Big,
    tokenContract?: string
  ): Promise<{ fee: Big }> {
    const { address } = this.derivePrivateKey(params);
    const gasPrice = await this.provider.getGasPrice();
    let gasLimit: BigNumber;

    if (tokenContract) {
      // ERC20 fee estimation
      const contract = new Contract(tokenContract, ERC20_ABI, this.provider);
      const decimals: number = await contract.decimals();
      const scaled = Big(amount.toString()).times(Big(10).pow(decimals));
      const value = BigNumber.from(scaled.toFixed(0));
      gasLimit = await contract.estimateGas.transfer(to, value, { from: address });
    } else {
      // Native fee estimation
      const value = BigNumber.from(amount.toString());
      gasLimit = await this.provider.estimateGas({ from: address, to, value });
    }

    const feeWei = gasLimit.mul(gasPrice);
    return { fee: Big(feeWei.toString()) };
  }

  /**
   * Fetch transaction history for the derived address (requires explorerApiKey)
   */
  async getHistory(
    params: DeriveParams
  ): Promise<Array<{ txHash: string; amount: Big }>> {
    if (!this.config.explorerApiKey) {
      throw new Error("explorerApiKey must be provided in config to fetch history");
    }
    const { address } = this.derivePrivateKey(params);
    const etherscan = new providers.EtherscanProvider(
      this.chainName,
      this.config.explorerApiKey
    );
    const txs = await etherscan.getHistory(address);
    return txs.map((tx) => ({
      txHash: tx.hash,
      amount: Big(tx.value.toString()),
    }));
  }

  public registerAdapter(): void {
    SUPPORTED_EVM_CHAINS.forEach((chain) => {
      const { http, ws, chainId } = getRpcEndpoints(chain);
      new EvmAdapter(
        { chainName: chain, rpcUrl: http, wsUrl: ws, chainId },
        this.masterSeed
      );
    });
  }
}