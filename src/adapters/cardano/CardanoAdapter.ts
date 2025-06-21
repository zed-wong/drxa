// src/adapters/cardano/CardanoAdapter.ts

import { IChainAdapter, SupportedChain, ChainConfig, TransactionResponse } from "../../types/index.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import { ChainManager } from "../../core/ChainManager.js";
import Big from "big.js";
import * as CSL from "@emurgo/cardano-serialization-lib-nodejs";

export interface AdaConfig {
  network?: "mainnet" | "testnet";
  nodeUrl?: string;         // e.g. Blockfrost or direct cardano-node HTTP API
  networkMagic?: number;   // only for testnet, e.g. 1097911063
}

export class CardanoAdapter implements IChainAdapter {
  public readonly chainName: SupportedChain = "cardano";
  public readonly config: ChainConfig = {
    name: 'Cardano',
    symbol: 'ADA',
    decimals: 6,
    category: 'utxo',
    endpoints: {
      http: {
        url: 'https://cardano-mainnet.blockfrost.io/api/v0',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://cardanoscan.io',
      apiUrl: 'https://cardano-mainnet.blockfrost.io/api/v0'
    }
  };
  private adaConfig: AdaConfig;
  private masterSeed: Uint8Array;
  private networkId: number;
  private magic?: number;

  constructor(masterSeed: Uint8Array, config?: AdaConfig) {
    this.adaConfig = config || {};
    this.masterSeed = masterSeed;
    this.networkId = config?.network === "mainnet" ? 1 : 0;
    this.magic = config?.networkMagic;
    ChainManager.register(this);
  }

  /** CIP‑1852 path: m/1852'/1815'/0'/role/index */
  private deriveKeyPair(params: DeriveParams) {
    const ENTROPY = deriveEntropy(this.masterSeed, params);
    // root from 32‑byte entropy + zero salt
    const root = CSL.Bip32PrivateKey.from_bip39_entropy(
      ENTROPY.slice(0, 32),
      Buffer.alloc(32)
    );
    const HARD = 0x80000000;
    const account = root
      .derive(HARD + 1852)  // purpose
      .derive(HARD + 1815)  // coin type (ADA)
      .derive(HARD + 0);    // account 0

    // payment key at path /0/index
    const payPrv = account.derive(0).derive(Number(params.index));
    const payPub = payPrv.to_public();

    // stake key at path /2/0
    const stakePrv = account.derive(2).derive(0);
    const stakePub = stakePrv.to_public();

    return { payPrv, payPub, stakePub };
  }

  async deriveAddress(params: DeriveParams): Promise<string> {
    const { payPub, stakePub } = this.deriveKeyPair(params);
    const paymentCred = CSL.Credential.from_keyhash(
      payPub.to_raw_key().hash()
    );
    const stakeCred = CSL.Credential.from_keyhash(
      stakePub.to_raw_key().hash()
    );
    const baseAddr = CSL.BaseAddress.new(
      this.networkId,
      paymentCred,
      stakeCred
    );
    return baseAddr.to_address().to_bech32();
  }

  async balance(params: DeriveParams): Promise<Big> {
    const addr = await this.deriveAddress(params);
    const resp = await fetch(`${this.adaConfig.nodeUrl}/addresses/${addr}/utxos`);
    if (!resp.ok) throw new Error(`Failed to fetch UTXOs: ${resp.status}`);
    const utxos: Array<{ amount: Array<{ unit: string; quantity: string }> }> =
      await resp.json();

    // sum up all lovelace, convert to ADA
    const lovelace = utxos.reduce((sum, utxo) => {
      const lov = utxo.amount.find((a) => a.unit === "lovelace");
      return sum.plus(lov?.quantity ?? "0");
    }, new Big(0));

    return lovelace.div(new Big(1_000_000));
  }

  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<TransactionResponse> {
    const { payPrv } = this.deriveKeyPair(params);
    const fromAddr = await this.deriveAddress(params);

    // 1) fetch UTXOs
    const utxoRes = await fetch(
      `${this.adaConfig.nodeUrl}/addresses/${fromAddr}/utxos`
    );
    const utxos: any[] = await utxoRes.json();

    // 2) init tx builder
    const txBuilder = CSL.TransactionBuilder.new(
      CSL.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          CSL.LinearFee.new(
            CSL.BigNum.from_str("44"),      // min fee coeff
            CSL.BigNum.from_str("155381")   // min fee constant
          )
        )
        .pool_deposit(CSL.BigNum.from_str("500000000"))
        .key_deposit(CSL.BigNum.from_str("2000000"))
        .max_value_size(5000)
        .max_tx_size(16384)
        .coins_per_utxo_byte(CSL.BigNum.from_str("34482"))
        .build()
    );

    // 3) add inputs
    utxos.forEach((u) => {
      const input = CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from(u.tx_hash, "hex")),
        u.output_index
      );
      const value = CSL.Value.new(
        CSL.BigNum.from_str(
          u.amount.find((x: any) => x.unit === "lovelace")!.quantity
        )
      );
      txBuilder.add_regular_input(
        CSL.Address.from_bech32(fromAddr),
        input,
        value
      );
    });

    // 4) add output
    const adaLovelace = amount.times(1_000_000).toFixed(0);
    txBuilder.add_output(
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(to),
        CSL.Value.new(CSL.BigNum.from_str(adaLovelace))
      )
    );

    // 5) set TTL
    const tipRes = await fetch(`${this.adaConfig.nodeUrl}/blocks/latest`);
    const tip = await tipRes.json() as { slot: number };
    txBuilder.set_ttl(tip.slot + 7200);

    // 6) change back
    txBuilder.add_change_if_needed(CSL.Address.from_bech32(fromAddr));

    // 7) build & sign
    const txBody = txBuilder.build();
    // Create a temporary transaction to get the hash
    const tempTx = CSL.Transaction.new(txBody, CSL.TransactionWitnessSet.new(), undefined);
    // Calculate hash manually using transaction bytes
    const txBytes = tempTx.to_bytes();
    // Create a hash from the body bytes for signing
    const txHash = CSL.TransactionHash.from_bytes(txBytes.slice(0, 32)); // Use first 32 bytes as hash

    const witnessSet = CSL.TransactionWitnessSet.new();
    const vkeyWit = CSL.Vkeywitnesses.new();
    const vkey = CSL.make_vkey_witness(
      txHash,
      payPrv.to_raw_key()
    );
    vkeyWit.add(vkey);
    witnessSet.set_vkeys(vkeyWit);

    const signed = CSL.Transaction.new(txBody, witnessSet, undefined);
    const signedBytes = signed.to_bytes();

    // 8) submit
    const submitRes = await fetch(`${this.adaConfig.nodeUrl}/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: Buffer.from(signedBytes),
    });
    if (!submitRes.ok)
      throw new Error(`Submit failed: ${submitRes.statusText}`);

    return { 
      txHash: txHash.to_hex(),
      status: 'pending'
    };
  }
}