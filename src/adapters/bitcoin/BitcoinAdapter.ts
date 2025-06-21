import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import { IChainAdapter, SupportedChain, ChainConfig, TransactionResponse, TransactionConfig, BitcoinTransactionConfig, SubscriptionCallback, Unsubscribe, IncomingTransaction } from "../../types/index.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import Big from "big.js";
import axios from "axios";
import { Buffer } from "buffer";
import * as tinysecp from "tiny-secp256k1";
import { initEccLib } from "bitcoinjs-lib";
import type { Signer } from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { payments, Psbt, networks } from "bitcoinjs-lib";

// Initialize secp256k1 backend
initEccLib(tinysecp);

/**
 * Bitcoin adapter: derive, send, and monitor via Blockstream API using Taproot (P2TR).
 */
export class BitcoinAdapter implements IChainAdapter {
  readonly chainName: SupportedChain = "bitcoin";
  readonly config: ChainConfig = {
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    category: 'utxo',
    endpoints: {
      http: {
        url: 'https://blockstream.info/api',
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
      }
    },
    explorer: {
      url: 'https://blockstream.info',
      apiUrl: 'https://blockstream.info/api'
    }
  };
  private explorerApi: string;
  private masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array) {
    const eps = getRpcEndpoints("bitcoin");
    this.explorerApi = eps.explorerApi ?? "";
    ChainManager.register(this);
    this.masterSeed = masterSeed;
  }

  /**
   * Derive a private key and Taproot address from masterSeed + params.
   */
  derivePrivateKey(params: DeriveParams): { priv: Uint8Array; address: string } {
    const entropy = deriveEntropy(this.masterSeed, params);
    const priv = entropy.slice(0, 32);
    const ECPair = ECPairFactory(tinysecp);
    const keyPair: ECPairInterface = ECPair.fromPrivateKey(Buffer.from(priv), { compressed: true });
    const internalPubkey = toXOnly(Buffer.from(keyPair.publicKey));
    const { address } = payments.p2tr({ internalPubkey, network: networks.bitcoin });
    if (!address) throw new Error("Failed to generate Taproot (P2TR) address");
    return { priv, address };
  }

  /**
   * Derive just the address.
   */
  async deriveAddress(params: DeriveParams): Promise<string> {
    return this.derivePrivateKey(params).address;
  }

  /**
   * Fetch confirmed balance (in sats) from Blockstream API.
   */
  async balance(params: DeriveParams): Promise<Big> {
    const { address } = this.derivePrivateKey(params);
    const { data } = await axios.get(`${this.explorerApi}/address/${address}`);
    console.log("Balance data:", JSON.stringify(data));
    console.log(`${this.explorerApi}/address/${address}`)
    const funded = data.chain_stats.funded_txo_sum;
    const spent = data.chain_stats.spent_txo_sum;
    return new Big(funded - spent);
  }

  /**
   * Build, sign, and broadcast a P2TR transaction.
   * @param feeRateSatPerVByte fee rate in sats/vByte (default: 1)
   */
  async send(
    params: DeriveParams,
    to: string,
    amount: Big,
    config?: TransactionConfig
  ): Promise<TransactionResponse> {
    const btcConfig = config as BitcoinTransactionConfig;
    const feeRateSatPerVByte = btcConfig?.satPerVByte?.toNumber() || btcConfig?.feeRate?.toNumber() || 1;
    const { priv, address: from } = this.derivePrivateKey(params);
    const utxos: Array<{ txid: string; vout: number; value: number }> = (
      await axios.get(`${this.explorerApi}/address/${from}/utxo`)
    ).data;

    const psbt = new Psbt({ network: networks.bitcoin });
    let inputSum = new Big(0);

    // Add inputs until we cover amount + estimated fee
    for (const utxo of utxos) {
      // need raw tx hex for nonWitnessUtxo
      const { data: rawHex } = await axios.get(`${this.explorerApi}/tx/${utxo.txid}/hex`);
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(rawHex, "hex"),
      });
      inputSum = inputSum.plus(utxo.value);
      // Simple fee estimate: inputs*68 + outputs*31 vbytes
      const estVBytes = psbt.txInputs.length * 68 + (2) * 31;
      const estFee = new Big(feeRateSatPerVByte).times(estVBytes);
      if (inputSum.gte(amount.plus(estFee))) break;
    }

    // Final fee & outputs
    const totalVBytes = psbt.txInputs.length * 68 + 2 * 31;
    const fee = new Big(feeRateSatPerVByte).times(totalVBytes);
    psbt.addOutput({ address: to, value: BigInt(amount.toString()) });
    psbt.addOutput({ address: from, value: BigInt(inputSum.minus(amount).minus(fee).toString()) });

    // Sign and finalize
    const ECPair = ECPairFactory(tinysecp);
    const keyPair = ECPair.fromPrivateKey(Buffer.from(priv), { compressed: true });
    psbt.signAllInputs(wrapAsSigner(keyPair));
    psbt.finalizeAllInputs();

    const rawTx = psbt.extractTransaction().toHex();
    const { data: txid } = await axios.post(`${this.explorerApi}/tx`, rawTx);
    return { 
      txHash: txid,
      status: 'pending'
    };
  }

  /**
   * Poll for new transactions to this address every 15s.
   */
  async subscribe(
    address: string,
    callback: SubscriptionCallback
  ): Promise<Unsubscribe> {
    const seen = new Set<string>();
    const interval = setInterval(async () => {
      try {
        const { data: txs } = await axios.get(`${this.explorerApi}/address/${address}/txs`);
        for (const tx of txs) {
          if (!seen.has(tx.txid)) {
            seen.add(tx.txid);
            // Find the amount sent to this address
            let amount = new Big(0);
            for (const vout of tx.vout || []) {
              if (vout.scriptpubkey_address === address) {
                amount = amount.plus(vout.value);
              }
            }
            callback({
              txHash: tx.txid,
              from: 'unknown',
              to: address,
              amount,
              blockNumber: tx.status?.block_height,
              timestamp: tx.status?.block_time ? tx.status.block_time * 1000 : undefined
            });
          }
        }
      } catch (e) {
        console.error("Bitcoin subscribe error", e);
      }
    }, 15000);
    return () => clearInterval(interval);
  }
}

/**
 * Adapter signer wrapper supporting Schnorr for P2TR.
 */
function wrapAsSigner(ecpair: ECPairInterface): Signer {
  return {
    publicKey: Buffer.from(ecpair.publicKey),
    sign: (hash: Buffer) => Buffer.from(ecpair.sign(hash)),
    signSchnorr: (hash: Buffer) => Buffer.from((ecpair as any).signSchnorr(hash)),
  };
}