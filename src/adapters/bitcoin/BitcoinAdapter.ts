// src/adapters/bitcoin/BitcoinAdapter.ts
import { ChainManager } from "../../core/ChainManager.js";
import { getRpcEndpoints } from "../../constants/config.js";
import { IChainAdapter } from "../../interfaces/IChainAdapter.js";
import { deriveEntropy, DeriveParams } from "../../utils/derivation.js";
import Big from "big.js";
import axios from "axios";
import { Buffer } from "buffer";
import * as tinysecp from "tiny-secp256k1";
import { initEccLib } from "bitcoinjs-lib";
import type { Signer } from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { payments, Psbt, networks } from "bitcoinjs-lib";

// Initialize ECC library for bitcoinjs-lib
initEccLib(tinysecp);

/**
 * Bitcoin adapter: derive, send, and monitor via Blockstream API using unified derivation.
 */
export class BitcoinAdapter implements IChainAdapter {
  readonly chainName = "bitcoin";
  private explorerApi: string;
  private masterSeed: Uint8Array;

  constructor(masterSeed: Uint8Array) {
    const eps = getRpcEndpoints("bitcoin");
    this.explorerApi = eps.explorerApi ?? "";
    ChainManager.register(this);
    this.masterSeed = masterSeed;
  }

  /**
   * Derive a Bitcoin Taproot (P2TR) address using unified derivation parameters.
   */
  async deriveAddress(params: DeriveParams): Promise<string> {
    const { priv } = this.derivePrivateKey(params);

    // Initialize ECPair with correct secp256k1 backend
    const ECPair = ECPairFactory(tinysecp);

    // Create keypair from derived private key
    const keyPair: ECPairInterface = ECPair.fromPrivateKey(Buffer.from(priv), {
      compressed: true,
    });

    const internalPubkey = toXOnly(Buffer.from(keyPair.publicKey));

    // Get Taproot (P2TR) address using bitcoinjs-lib
    const { address } = payments.p2tr({
      internalPubkey,
      network: networks.bitcoin
    });
    if (!address) {
      throw new Error("Failed to generate Taproot (P2TR) address");
    }

    return address;
  }

  /**
   * Derive private key and address using unified derivation parameters.
   */
  derivePrivateKey(params: DeriveParams): { priv: Uint8Array; address: string } {
    const entropy = deriveEntropy(this.masterSeed, params);
    const priv = entropy.slice(0, 32); // use first 32 bytes as seed

    // Initialize ECPair with correct secp256k1 backend
    const ECPair = ECPairFactory(tinysecp);

    // Create keypair from derived private key
    const keyPair: ECPairInterface = ECPair.fromPrivateKey(Buffer.from(priv), {
      compressed: true,
    });

    const internalPubkey = toXOnly(Buffer.from(keyPair.publicKey));

    // Get Taproot (P2TR) address using bitcoinjs-lib
    const { address } = payments.p2tr({
      internalPubkey,
      network: networks.bitcoin
    });
    if (!address) {
      throw new Error("Failed to generate Taproot (P2TR) address");
    }

    return { priv, address };
  }

  async balance(params: DeriveParams, options?: { url: string}): Promise<Big> {
    const { address } = this.derivePrivateKey(params);
    const { data: balanceData } = await axios.get(
      options?.url || `${this.explorerApi}/address/${address}`
    );
    return new Big(balanceData);
  }

  /**
   * Build, sign, and broadcast a Bitcoin transaction via Blockstream API.
   */
  async send(
    params: DeriveParams,
    to: string,
    amount: Big
  ): Promise<{ txHash: string }> {
    const { priv, address: from } = this.derivePrivateKey(params);

    // Fetch UTXOs
    const utxos: any[] = (
      await axios.get(`${this.explorerApi}/address/${from}/utxo`)
    ).data;

    // Build PSBT
    const psbt = new Psbt();
    let inputSum = new Big(0);
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(utxo.raw_tx, "hex"),
      });
      inputSum = inputSum.plus(utxo.value);
      if (inputSum.gte(amount.plus(1000))) break;
    }
    psbt.addOutput({ address: to, value: BigInt(amount.toString()) });
    psbt.addOutput({ address: from, value: BigInt(inputSum.minus(amount).minus(1000).toString()) });

    // Sign & finalize
    const ECPair = ECPairFactory(tinysecp);
    const keyPair: ECPairInterface = ECPair.fromPrivateKey(
      Buffer.from(priv),
      { compressed: true }
    );
    psbt.signAllInputs(wrapAsSigner(keyPair));
    psbt.finalizeAllInputs();
    const rawTx = psbt.extractTransaction().toHex();

    // Broadcast
    const resp = await axios.post(`${this.explorerApi}/tx`, rawTx);
    return { txHash: resp.data };
  }

  /**
   * Poll the Blockstream API for new transactions to this address.
   */
  async subscribe(
    address: string,
    onIncoming: (txHash: string, amount: Big) => void
  ): Promise<{ unsubscribe: () => void }> {
    const seen = new Set<string>();
    const interval = setInterval(async () => {
      try {
        const { data: txs } = await axios.get(
          `${this.explorerApi}/address/${address}/txs`
        );
        for (const tx of txs) {
          if (!seen.has(tx.txid)) {
            seen.add(tx.txid);
            onIncoming(tx.txid, new Big(0));
          }
        }
      } catch (e) {
        console.error("Bitcoin subscribe error", e);
      }
    }, 15000);
    return { unsubscribe: () => clearInterval(interval) };
  }
}

// Custom signer adapter for bitcoinjs-lib PSBT
function wrapAsSigner(ecpair: ECPairInterface): Signer {
  return {
    publicKey: Buffer.from(ecpair.publicKey),
    sign: (hash: Buffer) => Buffer.from(ecpair.sign(hash)),
    signSchnorr: undefined, // Not needed for P2PKH
  };
}

/**
 * Register Bitcoin adapter in the ChainManager.
 * Call once during SDK initialization.
 */
export function registerBitcoinAdapter(masterSeed: Uint8Array) {
  new BitcoinAdapter(masterSeed);
}
