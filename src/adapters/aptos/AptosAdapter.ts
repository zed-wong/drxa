import { IChainAdapter } from "../../interfaces/IChainAdapter.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import Big from "big.js";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";

export class AptosAdapter implements IChainAdapter {
  public readonly chainName = "aptos";
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
    const store = await this.sdk.getAccountResource<{ coin: { value: string } }>({
      accountAddress: acct.accountAddress,
      resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
    });
    return Big(store.coin.value);
  }

  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{ txHash: string }> {
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
    return { txHash: committed.hash };
  }
}
