// src/constants/config.ts
export interface RpcEndpoints {
  http: string;
  ws?: string;
  explorer?: string;
  explorerApi?: string;
}

// Default RPC, WS, Explorer, and Explorer API endpoints for all chains
export const DEFAULT_RPC_URLS: Record<string, RpcEndpoints> = {
  ethereum: {
    http: "https://eth.llamarpc.com",
    ws: "wss://mainnet.gateway.tenderly.co",
    explorer: "https://etherscan.io",
    explorerApi: "https://api.etherscan.io/api",
  },
  bsc: {
    http: "https://bsc-dataseed.binance.org/",
    ws: "wss://bsc-ws-node.nariox.org:443",
    explorer: "https://bscscan.com",
    explorerApi: "https://api.bscscan.com/api",
  },
  cronos: {
    http: "https://evm-cronos.crypto.org",
    ws: "wss://evm-cronos.crypto.org/ws",
    explorer: "https://cronoscan.com",
    explorerApi: "https://api.cronoscan.com/api",
  },
  polygon: {
    http: "https://polygon-bor-rpc.publicnode.com",
    ws: "wss://polygon-bor-rpc.publicnode.com",
    explorer: "https://polygonscan.com",
    explorerApi: "https://api.polygonscan.com/api",
  },
  avalanche: {
    http: "https://avalanche-c-chain-rpc.publicnode.com",
    ws: "wss://avalanche-c-chain-rpc.publicnode.com",
    explorer: "https://snowtrace.io",
    explorerApi: "https://api.snowtrace.io/api",
  },
  fantom: {
    http: "https://rpc.ftm.tools",
    ws: "wss://wsapi.fantom.network/",
    explorer: "https://ftmscan.com",
    explorerApi: "https://api.ftmscan.com/api",
  },
  optimism: {
    http: "https://mainnet.optimism.io",
    ws: "wss://mainnet.optimism.io/ws",
    explorer: "https://optimistic.etherscan.io",
    explorerApi: "https://api-optimistic.etherscan.io/api",
  },
  arbitrum: {
    http: "https://arb1.arbitrum.io/rpc",
    ws: "wss://arb1.arbitrum.io/ws",
    explorer: "https://arbiscan.io",
    explorerApi: "https://api.arbiscan.io/api",
  },
  tron: {
    http: "https://tron-rpc.publicnode.com",
    explorer: "https://tronscan.org",
    explorerApi: "https://api.trongrid.io",
  },
  solana: {
    http: "https://api.mainnet-beta.solana.com",
    ws: "wss://api.mainnet-beta.solana.com",
    explorer: "https://explorer.solana.com",
    explorerApi: "https://public-api.solscan.io",
  },
  polkadot: {
    http: "https://rpc.polkadot.io",
    explorer: "https://polkascan.io/polkadot",
    explorerApi: "https://polkadot.api.subscan.io/api/scan",
  },
  bitcoin: {
    http: "https://blockstream.info/api",
    explorer: "https://blockstream.info",
    explorerApi: "https://blockstream.info/api",
  },
};

export const SUPPORTED_CHAINS = Object.keys(DEFAULT_RPC_URLS);
export type SupportedChain = typeof SUPPORTED_CHAINS[number];

// Runtime overrides stored here
const overrides: Partial<Record<string, RpcEndpoints>> = {};

/**
 * Override default endpoints for a specific chain at runtime
 */
export function setRpcOverride(chain: string, endpoints: RpcEndpoints) {
  overrides[chain] = endpoints;
}

/**
 * Get effective endpoints (override takes precedence over default)
 */
export function getRpcEndpoints(chain: string): RpcEndpoints {
  return overrides[chain] || DEFAULT_RPC_URLS[chain];
}
