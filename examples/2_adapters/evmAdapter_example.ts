// examples/2_evm/evmAdapter_example.ts
import { exit } from "node:process";
import { EvmAdapter } from "../../src/adapters/evm/EvmAdapter.js";
import Big from "big.js";

(async () => {
  const seed = new Uint8Array(32).fill(1); // Example master seed
  const config = {
    chainName: "arbitrum", // or "arbitrum", "optimism", etc.

    // These value can be set to overide the default RPC endpoints
    // rpcUrl: "https://eth.llamarpc.com",
    // wsUrl: "wss://mainnet.gateway.tenderly.co",
    // chainId: 1,
  };

  const evmAdapter = new EvmAdapter(config, seed);
  const deriveParams = {
    scope: "wallet",
    userId: "0d0e72f3-7b46-483e-b12d-8696ecab55a0",
    chain: "ethereum",
    index: "0",
  }

  // 1. Derive Ethereum address
  const derivedAddress = await evmAdapter.deriveAddress(deriveParams);
  console.log("Derived Ethereum Address:", derivedAddress);




  // 2. Fetch native token balance
  const balance = await evmAdapter.balance(deriveParams);
  console.log("Native Token Balance:", balance.toString());




  // 3. Fetch ERC20 token balance
  const tokenContract = "0x6b175474e89094c44da98b954eedeac495271d0f"; // DAI (ERC20)
  const tokenBalance = await evmAdapter.tokenBalance(deriveParams, tokenContract);
  console.log("ERC20 Token Balance:", tokenBalance.toString());




  // 4. Send native tokens
  if (balance.gt(0)) {
    const tx = await evmAdapter.send(
      deriveParams,
      "0x6b175474e89094c44da98b954eedeac495271d0f",
      Big(0)
    );
    console.log("Transaction Hash (Native Token):", tx.txHash);  
  }



  // 5. Send ERC20 tokens
  if (tokenBalance.gt(0)) {
    const tokenTx = await evmAdapter.sendToken(
      deriveParams,
      tokenContract,
      "0x6b175474e89094c44da98b954eedeac495271d0f",
      Big(0)
    );
    console.log("Transaction Hash (ERC20 Token):", tokenTx.txHash);
  }

  exit(0);
})();