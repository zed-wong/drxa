import { ChainManager } from "../../core/ChainManager.js";
import { IChainAdapter, SupportedChain, ChainConfig, TransactionResponse, TransactionConfig, EvmTransactionConfig, SubscriptionCallback, Unsubscribe, IncomingTransaction, FeeEstimate, TransactionHistory } from "../../types/index.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
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
  chainName?: string;
  chainId?: string | number;
  rpcUrl?: string;
  wsUrl?: string;
  /** Required for getHistory */
  explorerApiKey?: string;
}

export class EvmAdapter implements IChainAdapter {
  public readonly chainName: SupportedChain;
  public readonly chainId: number;
  public readonly config: ChainConfig;
  private readonly evmConfig: EvmConfig;
  protected provider: providers.JsonRpcProvider;
  protected wsProvider: providers.WebSocketProvider;
  private masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array, config?: EvmConfig) {
    const rpcEndpoints = getRpcEndpoints(config?.chainName || 'ethereum');
    if (!rpcEndpoints) {
      throw new Error(`RPC endpoints not found for chain ${config?.chainName}`);
    }
    this.evmConfig = config || {};
    this.chainName = (config?.chainName || "ethereum") as SupportedChain;
    
    // Set up ChainConfig
    this.config = {
      name: this.chainName,
      symbol: this.getChainSymbol(this.chainName),
      decimals: 18,
      category: 'evm',
      endpoints: {
        http: {
          url: config?.rpcUrl || rpcEndpoints.http,
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        },
        ws: config?.wsUrl || rpcEndpoints.ws ? {
          url: config?.wsUrl || rpcEndpoints.ws || '',
          timeout: 30000,
          retryCount: 3,
          retryDelay: 1000
        } : undefined
      },
      explorer: this.getExplorerConfig(this.chainName)
    };

    // Determine chain ID: prefer config.chainId, otherwise use default RPC config
    this.chainId = config?.chainId !== undefined
      ? Number(config?.chainId)
      : Number(rpcEndpoints.chainId);
    this.masterSeed = masterSeed;

    // Pass explicit network object to avoid auto-detect network failure
    this.provider = new providers.JsonRpcProvider(
      config?.rpcUrl || rpcEndpoints.http,
      { name: this.chainName, chainId: this.chainId }
    );
    this.wsProvider = new providers.WebSocketProvider(
      config?.wsUrl || rpcEndpoints.ws || "",
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
    amount: Big,
    config?: TransactionConfig
  ): Promise<TransactionResponse> {
    const { priv } = this.derivePrivateKey(params);
    const wallet = new Wallet(priv, this.provider);
    const tx = await wallet.sendTransaction({
      to,
      value: BigNumber.from(amount.toString()),
    });
    const receipt = await tx.wait();
    return { 
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      confirmations: receipt.confirmations,
      status: receipt.status === 1 ? 'confirmed' : 'failed'
    };
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
    return { 
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      confirmations: receipt.confirmations,
      status: receipt.status === 1 ? 'confirmed' : 'failed'
    } as TransactionResponse;
  }

  async subscribe(
    address: string,
    callback: SubscriptionCallback
  ): Promise<Unsubscribe> {
    let last = await this.provider.getBalance(address);
    const handler = async (block: number) => {
      const bal = await this.provider.getBalance(address);
      if (bal.gt(last)) {
        callback({
          txHash: `block${block}`,
          from: 'unknown',
          to: address,
          amount: Big(bal.sub(last).toString()),
          blockNumber: block
        });
      }
      last = bal;
    };
    this.wsProvider.on("block", handler);
    return () => { this.wsProvider.off("block", handler); };
  }

  /**
   * Estimate transaction fee in native token units
   */
  async estimateFee(
    params: DeriveParams,
    to: string,
    amount: Big,
    config?: TransactionConfig
  ): Promise<FeeEstimate> {
    const evmConfig = config as EvmTransactionConfig;
    const tokenContract = evmConfig?.data?.includes('0xa9059cbb') ? evmConfig.to : undefined;
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
    return { 
      baseFee: new Big(gasPrice.toString()).div(1e9),
      totalFee: new Big(feeWei.toString()).div(1e18),
      gasLimit: new Big(gasLimit.toString()),
      gasPrice: new Big(gasPrice.toString()).div(1e9)
    };
  }

  /**
   * Fetch transaction history for the derived address (requires explorerApiKey)
   */
  async getHistory(
    params: DeriveParams,
    limit?: number
  ): Promise<TransactionHistory[]> {
    if (!this.evmConfig.explorerApiKey) {
      throw new Error("explorerApiKey must be provided in config to fetch history");
    }
    const { address } = this.derivePrivateKey(params);
    const etherscan = new providers.EtherscanProvider(
      this.chainName,
      this.evmConfig.explorerApiKey
    );
    const txs = await etherscan.getHistory(address);
    return txs.map((tx) => ({
      txHash: tx.hash!,
      blockNumber: tx.blockNumber!,
      timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
      from: tx.from,
      to: tx.to!,
      amount: new Big(tx.value.toString()).div(1e18),
      fee: tx.gasPrice ? new Big(tx.gasPrice.mul((tx as any).gasUsed || 0).toString()).div(1e18) : new Big(0),
      status: 'confirmed' as const,
      direction: tx.from.toLowerCase() === address.toLowerCase() ? 'outgoing' as const : 'incoming' as const
    }));
  }

  public registerAllEVMAdapters(): void {
    SUPPORTED_EVM_CHAINS.forEach((chain) => {
      const { http, ws, chainId } = getRpcEndpoints(chain);
      new EvmAdapter(
        this.masterSeed,
        { chainName: chain, rpcUrl: http, wsUrl: ws, chainId },
      );
    });
  }
  
  private getChainSymbol(chain: string): string {
    const symbols: Record<string, string> = {
      ethereum: 'ETH',
      bsc: 'BNB',
      polygon: 'MATIC',
      avalanche: 'AVAX',
      arbitrum: 'ETH',
      optimism: 'ETH',
      cronos: 'CRO',
      sonic: 'S',
      base: 'ETH'
    };
    return symbols[chain] || 'ETH';
  }
  
  private getExplorerConfig(chain: string): { url: string; apiUrl?: string } | undefined {
    const explorers: Record<string, { url: string; apiUrl?: string }> = {
      ethereum: { url: 'https://etherscan.io', apiUrl: 'https://api.etherscan.io/api' },
      bsc: { url: 'https://bscscan.com', apiUrl: 'https://api.bscscan.com/api' },
      polygon: { url: 'https://polygonscan.com', apiUrl: 'https://api.polygonscan.com/api' },
      avalanche: { url: 'https://snowtrace.io', apiUrl: 'https://api.snowtrace.io/api' },
      arbitrum: { url: 'https://arbiscan.io', apiUrl: 'https://api.arbiscan.io/api' },
      optimism: { url: 'https://optimistic.etherscan.io', apiUrl: 'https://api-optimistic.etherscan.io/api' },
      cronos: { url: 'https://cronoscan.com', apiUrl: 'https://api.cronoscan.com/api' },
      base: { url: 'https://basescan.org', apiUrl: 'https://api.basescan.org/api' }
    };
    return explorers[chain];
  }
}