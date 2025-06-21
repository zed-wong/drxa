import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import { IChainAdapter, SupportedChain, ChainConfig, TransactionResponse } from "../../types/index.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import Big from "big.js";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";

export class AptosAdapter implements IChainAdapter {
  public readonly chainName: SupportedChain = "aptos";
  public readonly config: ChainConfig = {
    name: 'Aptos',
    symbol: 'APT',
    decimals: 8,
    category: 'other',
    endpoints: {
      http: {
        url: 'https://api.mainnet.aptoslabs.com/v1',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://explorer.aptoslabs.com',
      apiUrl: 'https://api.mainnet.aptoslabs.com/v1'
    }
  };
  private readonly sdk: Aptos;
  private readonly masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array, config?: { rpcUrl?: string }) {
    const { http: defaultUrl } = getRpcEndpoints("aptos")!;
    this.masterSeed = masterSeed;
    const aptosCfg = new AptosConfig({
      network: Network.MAINNET,
      fullnode: config?.rpcUrl || defaultUrl,
    });
    this.sdk = new Aptos(aptosCfg);
    ChainManager.register(this);
  }

  private async deriveAccount(params: DeriveParams): Promise<Account> {
    params.chain = "aptos";
    const entropy   = deriveEntropy(this.masterSeed, params);
    const privBytes = entropy.slice(0, 32);
    const privateKey = new Ed25519PrivateKey(privBytes);
    return Account.fromPrivateKey({ privateKey });
  }

  async deriveAddress(params: DeriveParams): Promise<string> {
    return (await this.deriveAccount(params)).accountAddress.toString();
  }

  async balance(params: DeriveParams): Promise<Big> {
    const acct = await this.deriveAccount(params);
    // NOT WORKING YET
    const balance = await this.sdk.getAccountAPTAmount({
      accountAddress: acct.accountAddress,
    });
    
    return Big(balance);
  }

  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<TransactionResponse> {
    const acct = await this.deriveAccount(params);
    const txReq = await this.sdk.transaction.build.simple({
      sender: acct.accountAddress,
      data: {
        function: "0x1::coin::transfer",
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [to, amount.toString()],
      },
    });
    const pending = await this.sdk.signAndSubmitTransaction({
      signer: acct,
      transaction: txReq,
    });
    const committed = await this.sdk.waitForTransaction({ transactionHash: pending.hash });
    return { 
      txHash: committed.hash,
      status: 'confirmed'
    };
  }
}
