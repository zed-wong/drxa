// src/adapters/bitcoin/BitcoinAdapter.ts
import { ChainManager } from "../../core/ChainManager";
import { getRpcEndpoints } from "../../constants/config";
import { IChainAdapter } from "../../interfaces/IChainAdapter";
import { deriveForChain, DeriveParams } from "../../utils/derivation";
import axios from "axios";
import { Buffer } from "buffer";
import * as tinysecp from "tiny-secp256k1";
import type { Signer } from "bitcoinjs-lib";
import { payments, Psbt, networks } from "bitcoinjs-lib";
import ECPairFactory, { ECPairInterface } from "ecpair";
import { toXOnly } from 'bitcoinjs-lib/src/cjs/psbt/bip371'

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
    const { priv } = deriveForChain(this.masterSeed, params);

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
      // pubkey: Buffer.from(keyPair.publicKey),
      network: networks.bitcoin
    });
    if (!address) {
      throw new Error("Failed to generate Taproot (P2TR) address");
    }

    return address;
  }

  /**
   * Build, sign, and broadcast a Bitcoin transaction via Blockstream API.
   */
  async send(
    path: string,
    to: string,
    amount: number | bigint
  ): Promise<{ txHash: string }> {
    const params: DeriveParams = {
      scope:  "wallet",
      userId: "default",
      chain:  "bitcoin",
      index:  path,
    };
    const { priv, address: from } = deriveForChain(this.masterSeed, params);

    // Fetch UTXOs
    const utxos: any[] = (
      await axios.get(`${this.explorerApi}/address/${from}/utxo`)
    ).data;

    // Build PSBT
    const psbt = new Psbt();
    let inputSum = 0;
    for (const utxo of utxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(utxo.raw_tx, "hex"),
      });
      inputSum += utxo.value;
      if (inputSum >= Number(amount) + 1000) break;
    }
    psbt.addOutput({ address: to, value: Number(amount) });
    psbt.addOutput({ address: from, value: inputSum - Number(amount) - 1000 });

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
    onIncoming: (txHash: string, amount: number | bigint) => void
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
            onIncoming(tx.txid, 0n);
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
