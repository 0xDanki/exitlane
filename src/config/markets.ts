/**
 * Trusted public market identifiers.
 *
 * Values here are not secrets — they are canonical on-chain addresses and
 * public subgraph IDs that are fixed by the network.  They may be imported
 * by both server and client code.
 *
 * DO NOT derive prices, amounts, or authorization decisions from values that
 * are not in this file or verified on-chain.  All values below were verified
 * by a live GraphQL query in Phase 3 (see docs/DECISIONS.md D-011).
 */

import { getAddress } from "viem";
import type { Address } from "viem";

// ── Chain IDs ─────────────────────────────────────────────────────────────────

/** Base mainnet chain ID — used for market evidence (Decision D-002). */
export const BASE_MAINNET_CHAIN_ID = 8453 as const;

/** Base Sepolia chain ID — used for execution in the MVP (Decision D-002). */
export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;

// ── Canonical token addresses on Base mainnet ─────────────────────────────────

/** Wrapped Ether (WETH) on Base mainnet. Native bridged token. 18 decimals. */
export const WETH_ADDRESS: Address = getAddress(
  "0x4200000000000000000000000000000000000006",
);
export const WETH_DECIMALS = 18 as const;

/**
 * Native USDC on Base mainnet (Coinbase-issued).
 * This is the non-bridged, canonical USD Coin on Base.  6 decimals.
 */
export const USDC_ADDRESS: Address = getAddress(
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
);
export const USDC_DECIMALS = 6 as const;

// ── Pool ─────────────────────────────────────────────────────────────────────

/**
 * Uniswap v3 WETH/USDC 0.05% pool on Base mainnet.
 *
 * Verified live (2026-09-13):
 *   token0 = WETH (0x4200...), token1 = USDC (0x8335...)
 *   token1Price = USDC per WETH = ETH price in USDC  ← field used for evidence
 *   feeTier = 500 (0.05%)
 *   TVL ≈ $8.7M, 36.2K Signal on The Graph
 *
 * See docs/DECISIONS.md D-011.
 */
export const WETH_USDC_POOL_ADDRESS: Address = getAddress(
  "0xd0b53D9277642d899df5C87A3966A349A798F224",
);

/** Pool fee tier in basis-point hundredths (500 = 0.05%). */
export const WETH_USDC_POOL_FEE_TIER = 500 as const;

// ── The Graph subgraph ────────────────────────────────────────────────────────

/**
 * Uniswap V3 Base subgraph on The Graph decentralized network.
 *
 * Verified live (2026-09-13):
 *   Network: base
 *   Signal: 36.2K (highest available for Uniswap v3 Base)
 *   Deployment: QmVeyHjXivX8mY7bzWdbHDyA5z9ojgJdTu6uwFJsJvUzYR
 *   hasIndexingErrors: false at verification time
 *
 * See docs/DECISIONS.md D-011.
 */
export const GRAPH_SUBGRAPH_ID =
  "GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz" as const;

/** The Graph gateway base URL. Subgraph ID is appended as a path segment. */
export const GRAPH_GATEWAY_BASE_URL =
  "https://gateway.thegraph.com/api/subgraphs/id" as const;
