import { IChainAdapter } from "../../src/interfaces/IChainAdapter.js";
import { deriveEntropy, DeriveParams } from "../../src/utils/derivation.js";
import { ChainManager } from "../../src/core/ChainManager.js";
import { getRpcEndpoints } from "../../src/constants/config.js";

import { Ed25519Keypair, RawSigner, JsonRpcProvider, Connection } from "@mysten/sui.js";
import Big from "big.js";

export interface SuiConfig {
  rpcUrl?: string;
  faucetUrl?: string;
  debug?: boolean;
}

export class SuiAdapter implements IChainAdapter {
  public readonly chainName = "sui";
  private readonly masterSeed: Uint8Array;
  private readonly provider: JsonRpcProvider;

  constructor(masterSeed: Uint8Array, config: SuiConfig = {}) {
    this.masterSeed = masterSeed;

    const defaultRpc = getRpcEndpoints("sui");
    const rpcUrl = config.rpcUrl || defaultRpc.http;
    const faucetUrl = config.faucetUrl || defaultRpc.faucet || "";

    this.provider = new JsonRpcProvider(new Connection({ fullnode: rpcUrl, faucet: faucetUrl }));

    if (config.debug) {
      console.log(`[SuiAdapter] RPC: ${rpcUrl}`);
      console.log(`[SuiAdapter] Faucet: ${faucetUrl}`);
    }

    ChainManager.register(this);
  }

  private derive(params: DeriveParams): { keypair: Ed25519Keypair; address: string } {
    const entropy = deriveEntropy(this.masterSeed, { ...params, chain: "sui" });
    const seed = entropy.slice(0, 32);
    const keypair = Ed25519Keypair.fromSeed(seed);
    const address = keypair.getPublicKey().toSuiAddress();
    return { keypair, address };
  }

  async deriveAddress(params: DeriveParams): Promise<string> {
    return this.derive(params).address;
  }

  async balance(params: DeriveParams): Promise<Big> {
    const { address } = this.derive(params);
    const coins = await this.provider.getCoins({ owner: address });
    const total = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
    return Big(total.toString());
  }

  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{ txHash: string }> {
    const { keypair, address } = this.derive(params);
    const signer = new RawSigner(keypair, this.provider);

    const coins = await this.provider.getCoins({ owner: address });
    const coinIds = coins.data.map((c) => c.coinObjectId);

    if (coinIds.length === 0) {
      throw new Error("No SUI coins available for transfer.");
    }

    const tx = await signer.paySui({
      inputCoins: coinIds,
      recipient: to,
      amount: BigInt(amount.toFixed(0)),
    });

    return { txHash: tx.digest };
  }

  async estimateFee(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{ fee: Big }> {
    const { keypair, address } = this.derive(params);
    const signer = new RawSigner(keypair, this.provider);

    const coins = await this.provider.getCoins({ owner: address });
    const coinIds = coins.data.map((c) => c.coinObjectId);

    const dryRun = await signer.dryRunTransactionBlock({
      kind: "paySui",
      data: {
        inputCoins: coinIds,
        recipient: to,
        amount: BigInt(amount.toFixed(0)),
      },
    });

    const totalGas = dryRun.effects.gasUsed.computationCost + dryRun.effects.gasUsed.storageCost;
    return { fee: Big(totalGas.toString()) };
  }

  async subscribe(): Promise<{ unsubscribe: () => void }> {
    // Placeholder for future WebSocket support
    throw new Error("Sui does not yet support push transaction subscription in this adapter.");
  }

  async getHistory(): Promise<Array<{ txHash: string; amount: Big }>> {
    // Not currently supported via public API without external indexer
    throw new Error("Sui getHistory is not implemented (no public indexer available).");
  }
}
