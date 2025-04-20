// examples/2_adapters/polkadot_example.ts
import { exit } from 'node:process';
import type { DeriveParams } from "../../src/utils/derivation.js";
import { generateEd25519Keypair, privToSeed } from "../../src/utils/keypair.js";
import { PolkadotAdapter, PolkadotConfig } from "../../src/adapters/polkadot/PolkadotAdapter.js";

(async () => {
  const { privateKey } = await generateEd25519Keypair();
  console.log('Private Key:', privateKey);
  const seed = privToSeed(privateKey);

  const config: PolkadotConfig = {
    wsUrl: 'wss://rpc.polkadot.io'
  };
  const adapter = new PolkadotAdapter(seed, config);

  const deriveParams: DeriveParams = {
    scope: 'wallet',
    userId: '0d0e72f3-7b46-483e-b12d-8696ecab55a0',
    chain: 'polkadot',
    index: '0'
  };

  // 1. Derive Polkadot address
  const address = await adapter.deriveAddress(deriveParams);
  console.log('Derived Address:', address);

  // 2. Get balance
  const balance = await adapter.balance(deriveParams);
  console.log('Free Balance (Planck):', balance.toString());

  // 3. Send transfer (if balance > 0)
  if (balance.gt(0)) {
    const { txHash } = await adapter.send(
      deriveParams,
      '15x2...destinationAddress...',
      balance.div(10)
    );
    console.log('Transfer Tx Hash:', txHash);
  }

  // // 4. Subscribe to balance changes
  // const sub = await adapter.subscribe(deriveParams, (txHash, newBal) => {
  //   console.log('Balance Update:', newBal.toString(), 'TxHash:', txHash);
  // });

  // Unsubscribe after 30s
  // setTimeout(() => {
  //   sub.unsubscribe();
  //   exit(0);
  // }, 30000);
  exit(0);
})();
