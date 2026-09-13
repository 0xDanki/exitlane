/**
 * Market evidence pipeline: fetch → validate → normalize → MarketEvidence.
 *
 * Data flow:
 *   The Graph gateway
 *     → HTTP (queryGraph)
 *     → Zod validation (RawEvidenceResponseSchema)
 *     → identity & decimal checks (WETH token0, USDC token1)
 *     → price orientation (token1Price = USDC per WETH = ETH price in USDC)
 *     → integer-only normalization (priceStringToScaled)
 *     → MarketEvidence domain type
 *
 * The Graph supplies evidence. It does NOT authorize execution.
 * Authorization is performed exclusively by the deterministic policy engine
 * in src/domain/policy.ts.
 *
 * Observation timestamp: taken from _meta.block.timestamp (chain data).
 * Date.now() is NEVER used as the market observation time.
 *
 * Price normalization: see priceStringToScaled and Decision D-012.
 */

import { z } from "zod";
import { getAddress } from "viem";
import {
  BASE_MAINNET_CHAIN_ID,
  GRAPH_SUBGRAPH_ID,
  USDC_ADDRESS,
  USDC_DECIMALS,
  WETH_ADDRESS,
  WETH_DECIMALS,
  WETH_USDC_POOL_ADDRESS,
} from "@/config/markets";
import { PRICE_DECIMALS, PRICE_SCALE } from "@/domain/evidence";
import type { MarketEvidence } from "@/domain/evidence";
import { queryGraph, GraphFetchError } from "./client";

// ── GraphQL query ─────────────────────────────────────────────────────────────

/**
 * The pool address must be lowercase in The Graph IDs.
 * WETH_USDC_POOL_ADDRESS is EIP-55 checksummed; toLowerCase() normalizes it.
 */
const POOL_ID = WETH_USDC_POOL_ADDRESS.toLowerCase();

const EVIDENCE_QUERY = `{
  pool(id: "${POOL_ID}") {
    id
    feeTier
    liquidity
    token0Price
    token1Price
    token0 {
      id
      symbol
      decimals
    }
    token1 {
      id
      symbol
      decimals
    }
  }
  _meta {
    block {
      number
      timestamp
    }
    hasIndexingErrors
  }
}`;

// ── Zod schema for the raw GraphQL response ───────────────────────────────────

const RawTokenSchema = z.object({
  id: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "token id must be a 40-hex-char address"),
  symbol: z.string().min(1, "symbol must be non-empty"),
  decimals: z
    .string()
    .regex(/^\d+$/, "decimals must be a non-negative integer string"),
});

/**
 * Price strings from The Graph use regular decimal notation
 * (no scientific notation, no negative sign).
 * Examples: "2476.438797276350927976", "0.0004038056587951315"
 */
const PriceStringSchema = z
  .string()
  .regex(
    /^\d+(\.\d+)?$/,
    "price must be a non-negative decimal string (no scientific notation)",
  );

const RawPoolSchema = z.object({
  id: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "pool id must be a 40-hex-char address"),
  feeTier: z
    .string()
    .regex(/^\d+$/, "feeTier must be a non-negative integer string"),
  liquidity: z
    .string()
    .regex(/^\d+$/, "liquidity must be a non-negative integer string"),
  token0Price: PriceStringSchema,
  token1Price: PriceStringSchema,
  token0: RawTokenSchema,
  token1: RawTokenSchema,
});

const RawMetaBlockSchema = z.object({
  /**
   * The latest indexed block number.
   * JavaScript number is safe: Base block numbers are well below MAX_SAFE_INTEGER.
   */
  number: z
    .number()
    .int()
    .min(1, "block number must be positive"),
  /**
   * Block timestamp in Unix seconds (chain-derived).
   * Used as the market observation timestamp — never Date.now().
   */
  timestamp: z
    .number()
    .int()
    .min(1, "block timestamp must be a positive Unix second"),
});

const RawMetaSchema = z.object({
  block: RawMetaBlockSchema,
  hasIndexingErrors: z.boolean(),
});

const RawEvidenceResponseSchema = z.object({
  /**
   * pool is null when the pool address is not found in the subgraph.
   * This produces POOL_NOT_FOUND.
   */
  pool: z.union([RawPoolSchema, z.null()]),
  _meta: RawMetaSchema,
});

type RawEvidenceResponse = z.infer<typeof RawEvidenceResponseSchema>;

// ── Price normalization ───────────────────────────────────────────────────────

/**
 * Converts a validated decimal price string to a `bigint` scaled by
 * PRICE_SCALE (10^PRICE_DECIMALS = 10^8).
 *
 * Rounding rule: **ceiling (round up)** — Decision D-012.
 *
 * The trigger comparator is "lte": execution is authorised when
 * `evidence.price ≤ mandate.triggerThreshold`.  Ceiling is the conservative
 * direction: if any raw digit beyond the 8th decimal place is non-zero, the
 * scaled integer is incremented by 1, making the observed price fractionally
 * higher.  A higher reported price makes the LTE trigger *harder* to satisfy,
 * preventing false-positive authorisations caused by sub-scale-unit rounding.
 *
 * Rules:
 *   - Values already representable with 8 or fewer fractional digits: exact,
 *     no increment.
 *   - Trailing discarded digits that are all zero: exact, no increment.
 *   - Any non-zero digit beyond position 8: increment base by 1n.
 *   - Carry boundaries (e.g. "1.999999999") are handled correctly by bigint
 *     addition — no special case required.
 *   - Maximum adjustment: +1 scale unit = +0.00000001 USDC.
 *
 * Uses only string manipulation and bigint arithmetic — no floating-point.
 *
 * @example
 * priceStringToScaled("2476.438797276350927976") → 247643879728n  // ceil: +1
 * priceStringToScaled("2476.43879727")           → 247643879727n  // exact (8 dp)
 * priceStringToScaled("2476.438797270000")       → 247643879727n  // discarded zeros
 * priceStringToScaled("2476.5")                  → 247650000000n  // exact
 * priceStringToScaled("2476")                    → 247600000000n  // integer
 * priceStringToScaled("1.999999999")             → 200000000n     // carry → 2.00000000
 * priceStringToScaled("0.000000001")             → 1n             // ceil of sub-unit
 */
export function priceStringToScaled(priceStr: string): bigint {
  const dotIdx = priceStr.indexOf(".");

  if (dotIdx === -1) {
    // Integer price — exact, no rounding needed.
    return BigInt(priceStr) * PRICE_SCALE;
  }

  const intPart = priceStr.slice(0, dotIdx);   // e.g. "2476"
  const fracPart = priceStr.slice(dotIdx + 1); // e.g. "438797276350927976"

  // Produce exactly PRICE_DECIMALS (8) fractional digits by padding short
  // strings with trailing zeros or slicing long strings.
  const frac8 = fracPart
    .padEnd(PRICE_DECIMALS, "0")
    .slice(0, PRICE_DECIMALS);

  // Any digit in the tail (positions 9+) that is non-zero triggers ceiling.
  // Carry is automatic via bigint addition; no special-case needed.
  const tail = fracPart.slice(PRICE_DECIMALS);
  const hasNonZeroTail = tail.split("").some((c) => c !== "0");

  const base = BigInt(intPart) * PRICE_SCALE + BigInt(frac8);
  return hasNonZeroTail ? base + 1n : base;
}

// ── Result and error types ────────────────────────────────────────────────────

/** Chain-derived provenance for the evidence snapshot. */
export type EvidenceProvenance = {
  /** Always "TheGraph" for this adapter. */
  provider: "TheGraph";
  /** Base mainnet chain ID (evidence chain). */
  sourceChainId: number;
  /** The Graph subgraph ID queried. */
  subgraphId: string;
  /** Pool contract address used as the price source. */
  poolAddress: string;
  /** The last block indexed by the subgraph at query time. */
  indexedBlock: number;
  /**
   * Unix timestamp (seconds) of the indexed block — chain-derived.
   * This is the market observation time; it is NOT Date.now().
   */
  observedTimestampSec: number;
};

export type EvidenceFetchResult = {
  evidence: MarketEvidence;
  provenance: EvidenceProvenance;
};

export class EvidenceFetchError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EvidenceFetchError";
    this.code = code;
  }
}

// ── Validation helpers ────────────────────────────────────────────────────────

/**
 * Verify that the pool's token identities and decimal counts match the
 * canonical addresses in src/config/markets.ts.
 *
 * Pool WETH/USDC 0.05% on Base always has:
 *   token0 = WETH (0x4200..., 18 dec)
 *   token1 = USDC (0x8335..., 6 dec)
 *
 * Any mismatch (wrong address, wrong decimals, or reversed orientation) is
 * rejected as UNEXPECTED_TOKEN to prevent a supply-chain compromise of the
 * subgraph from silently changing the price source.
 */
function validateTokenIdentities(pool: z.infer<typeof RawPoolSchema>): void {
  const t0id = getAddress(pool.token0.id);
  const t1id = getAddress(pool.token1.id);
  const t0dec = Number(pool.token0.decimals);
  const t1dec = Number(pool.token1.decimals);

  if (t0id !== WETH_ADDRESS) {
    throw new EvidenceFetchError(
      "UNEXPECTED_TOKEN_ADDRESS",
      `Expected token0 to be WETH (${WETH_ADDRESS}), got ${t0id}`,
    );
  }
  if (t1id !== USDC_ADDRESS) {
    throw new EvidenceFetchError(
      "UNEXPECTED_TOKEN_ADDRESS",
      `Expected token1 to be USDC (${USDC_ADDRESS}), got ${t1id}`,
    );
  }
  if (t0dec !== WETH_DECIMALS) {
    throw new EvidenceFetchError(
      "UNEXPECTED_TOKEN_DECIMALS",
      `Expected token0 (WETH) to have ${WETH_DECIMALS} decimals, got ${t0dec}`,
    );
  }
  if (t1dec !== USDC_DECIMALS) {
    throw new EvidenceFetchError(
      "UNEXPECTED_TOKEN_DECIMALS",
      `Expected token1 (USDC) to have ${USDC_DECIMALS} decimals, got ${t1dec}`,
    );
  }
}

// ── Main fetch function ───────────────────────────────────────────────────────

/**
 * Fetch, validate, and normalize the WETH/USDC market evidence from The Graph.
 *
 * Steps:
 * 1. Query the Uniswap v3 Base subgraph for the WETH/USDC 0.05% pool.
 * 2. Validate the raw response with Zod (schema, shape, types).
 * 3. Verify token identities and decimal counts against trusted config.
 * 4. Extract token1Price (USDC per WETH = ETH price in USDC).
 * 5. Normalize to bigint via priceStringToScaled (no floating-point).
 * 6. Validate price > 0.
 * 7. Build MarketEvidence with chain-derived observation timestamp.
 *
 * Throws `EvidenceFetchError` or `GraphFetchError` on any failure.
 * Never returns stale or fake data with a success result.
 */
export async function fetchWethUsdcEvidence(): Promise<EvidenceFetchResult> {
  // ── 1. Fetch ───────────────────────────────────────────────────────────────
  let raw: RawEvidenceResponse;
  try {
    const data = await queryGraph<unknown>(EVIDENCE_QUERY);
    const parsed = RawEvidenceResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new EvidenceFetchError(
        "SCHEMA_INVALID",
        `Raw Graph response failed schema validation: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    raw = parsed.data;
  } catch (e) {
    // Re-throw typed errors; wrap anything unexpected.
    if (e instanceof EvidenceFetchError || e instanceof GraphFetchError) {
      throw e;
    }
    throw new EvidenceFetchError(
      "FETCH_ERROR",
      e instanceof Error ? e.message : "Unknown error during Graph fetch",
    );
  }

  // ── 2. Check pool presence ─────────────────────────────────────────────────
  if (raw.pool === null) {
    throw new EvidenceFetchError(
      "POOL_NOT_FOUND",
      `Pool ${POOL_ID} was not found in subgraph ${GRAPH_SUBGRAPH_ID}`,
    );
  }
  const pool = raw.pool;

  // ── 3. Token identity verification ────────────────────────────────────────
  validateTokenIdentities(pool);

  // ── 4. Price extraction ────────────────────────────────────────────────────
  //
  // Price orientation (verified live, Decision D-011):
  //   token0 = WETH  →  token1Price = USDC per WETH = ETH price in USDC
  //
  // We use token1Price.  token0Price (WETH per USDC) is discarded.
  const priceStr = pool.token1Price;

  // ── 5. Normalize to integer scale (no floating-point) ─────────────────────
  const normalizedPrice = priceStringToScaled(priceStr);

  // ── 6. Price sanity check ──────────────────────────────────────────────────
  if (normalizedPrice === 0n) {
    throw new EvidenceFetchError(
      "PRICE_ZERO",
      `Normalized token1Price resolved to zero — raw value: "${priceStr}"`,
    );
  }

  // ── 7. Build result ────────────────────────────────────────────────────────
  //
  // observedAtMs = block timestamp × 1000 (chain-derived, NOT Date.now()).
  const observedAtMs = raw._meta.block.timestamp * 1_000;

  const evidence: MarketEvidence = {
    inputToken: WETH_ADDRESS,
    outputToken: USDC_ADDRESS,
    price: normalizedPrice,
    observedAtMs,
    indexedBlock: BigInt(raw._meta.block.number),
  };

  const provenance: EvidenceProvenance = {
    provider: "TheGraph",
    sourceChainId: BASE_MAINNET_CHAIN_ID,
    subgraphId: GRAPH_SUBGRAPH_ID,
    poolAddress: WETH_USDC_POOL_ADDRESS,
    indexedBlock: raw._meta.block.number,
    observedTimestampSec: raw._meta.block.timestamp,
  };

  return { evidence, provenance };
}
