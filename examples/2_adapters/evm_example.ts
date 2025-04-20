// examples/2_adapters/evm_example.ts
import Big from "big.js";
import { exit } from "node:process";
import { EvmAdapter, EvmConfig } from "../../src/adapters/evm/EvmAdapter.js";
import { generateEd25519Keypair, privToSeed } from "../../src/utils/keypair.js";

(async () => {
  const { privateKey } = await generateEd25519Keypair();
  // Or use a hardcoded private key for testing, you will get a consistent derived address
  // const privateKey = '3a84ae3e37f2f228b4bbb14ed032028a9e103248f834f52e8fce6de54e07c666'
  console.log("Private Key:", privateKey);
  const seed = privToSeed(privateKey)
  
  const config: EvmConfig = {
    // or "arbitrum", "optimism", etc.
    chainName: "ethereum",

    // These value can be set to overide the default RPC endpoints
    // chainId: 1,
    // rpcUrl: "https://eth.llamarpc.com",
    // wsUrl: "wss://mainnet.gateway.tenderly.co",

    explorerApiKey: '',
  };

  const evmAdapter = new EvmAdapter(seed, config);
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


  // 3. Send native tokens
  if (balance.gt(0)) {
    const ETHFeeEstimates = await evmAdapter.estimateFee(
      deriveParams, 
      "0x6b175474e89094c44da98b954eedeac495271d0f",
      Big(1),
    );
    console.log("Native Fee Estimates:", ETHFeeEstimates);

    const tx = await evmAdapter.send(
      deriveParams,
      "0x6b175474e89094c44da98b954eedeac495271d0f",
      Big(1)
    );
    console.log("Transaction Hash (Native Token):", tx.txHash);  
  }

  

  // 4. Fetch ERC20 token balance
  if (config.chainName === "ethereum") {
    const tokenContract = "0x6b175474e89094c44da98b954eedeac495271d0f"; // DAI (ERC20)
    const tokenBalance = await evmAdapter.tokenBalance(deriveParams, tokenContract);
    console.log("ERC20 Token Balance:", tokenBalance.toString());


  // 5. Send ERC20 tokens
    if (tokenBalance.gt(0)) {
      // 7. Fetch fee estimates
      const ERC20FeeEstimates = await evmAdapter.estimateFee(
        deriveParams, 
        "0x6b175474e89094c44da98b954eedeac495271d0f",
        Big(1),
        tokenContract
      );
      console.log("ERC20 Fee Estimates:", ERC20FeeEstimates);


      const tokenTx = await evmAdapter.sendToken(
        deriveParams,
        "0x6b175474e89094c44da98b954eedeac495271d0f",
        Big(1),
        tokenContract,
      );
      console.log("Transaction Hash (ERC20 Token):", tokenTx.txHash);
    }
  }


  // 6. Fetch transaction history
  if (config.explorerApiKey?.length) {
    const txHistory = await evmAdapter.getHistory(deriveParams);
    console.log("Transaction History:", txHistory);  
  }

  exit(0);
})();