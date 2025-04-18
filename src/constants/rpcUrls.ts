// src/constants/rpcUrls.ts

export interface RpcEndpoints {
    http: string;
    ws?: string;
  }
  
  export const DEFAULT_RPC_URLS: Record<string, RpcEndpoints> = {
    ethereum: {
      http: "https://eth.llamarpc.com",
      ws:  "wss://ethereum-rpc.publicnode.com",
    },
    bsc: {
      http: "https://bsc-dataseed.binance.org/",
      ws:  "wss://bsc-ws-node.nariox.org:443",
    },
    cronos: {
      http: "https://evm-cronos.crypto.org",
      ws:  "wss://evm-cronos.crypto.org/ws",
    },
    tron: {
      http: "https://api.trongrid.io",
    },
    polygon: {
      http: "https://polygon-bor-rpc.publicnode.com",
      ws:  "wss://polygon-bor-rpc.publicnode.com",
    },
    fantom: {
      http: "https://rpc.ftm.tools",
      ws:  "wss://wsapi.fantom.network/",
    },
    optimism: {
      http: "https://mainnet.optimism.io",
      ws:  "wss://mainnet.optimism.io/ws",
    },
    arbitrum: {
      http: "https://arb1.arbitrum.io/rpc",
      ws:  "wss://arb1.arbitrum.io/ws",
    },
    avalanche: {
      http: "https://api.avax.network/ext/bc/C/rpc",
      ws:  "wss://api.avax.network/ext/bc/C/ws",
    },
  };
