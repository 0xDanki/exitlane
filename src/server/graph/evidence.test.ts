/**
 * Tests for the Graph evidence pipeline.
 *
 * All tests use mocked fetch (vi.stubGlobal).
 * No network calls are made during the test suite.
 * THE_GRAPH_API_KEY is set to a non-secret test value per test or beforeEach.
 *
 * Test keys and addresses are deterministic test vectors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWethUsdcEvidence,
  priceStringToScaled,
  EvidenceFetchError,
} from "./evidence";
import { GraphFetchError } from "./client";
import { PRICE_SCALE, PRICE_DECIMALS } from "@/domain/evidence";
import {
  WETH_ADDRESS,
  USDC_ADDRESS,
  WETH_DECIMALS,
  USDC_DECIMALS,
  GRAPH_SUBGRAPH_ID,
  WETH_USDC_POOL_ADDRESS,
  BASE_MAINNET_CHAIN_ID,
} from "@/config/markets";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_API_KEY = "test-key-not-a-real-credential";

function mockFetchOk(data: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function mockFetchError(status: number, statusText: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status, statusText })),
  );
}

function mockFetchGraphqlErrors(errors: Array<{ message: string }>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: null, errors }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function mockFetchAbort(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })),
  );
}

function mockFetchNetworkError(message: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error(message)),
  );
}

/** Canonical live-shaped fixture. Matches the real subgraph response format. */
function validFixture(overrides: {
  token0Id?: string;
  token1Id?: string;
  token0Decimals?: string;
  token1Decimals?: string;
  token1Price?: string;
  pool?: unknown | null;
  metaBlock?: { number: number; timestamp: number };
  hasIndexingErrors?: boolean;
} = {}) {
  const {
    token0Id = WETH_ADDRESS.toLowerCase(),
    token1Id = USDC_ADDRESS.toLowerCase(),
    token0Decimals = String(WETH_DECIMALS),
    token1Decimals = String(USDC_DECIMALS),
    token1Price = "2476.438797276350927976",
    pool = undefined,
    metaBlock = { number: 51256938, timestamp: 1789303223 },
    hasIndexingErrors = false,
  } = overrides;

  const defaultPool = {
    id: WETH_USDC_POOL_ADDRESS.toLowerCase(),
    feeTier: "500",
    liquidity: "1173345620493556771",
    token0Price: "0.0004038056587951315040998",
    token1Price,
    token0: { id: token0Id, symbol: "WETH", decimals: token0Decimals },
    token1: { id: token1Id, symbol: "USDC", decimals: token1Decimals },
  };

  return {
    pool: pool === undefined ? defaultPool : pool,
    _meta: { block: metaBlock, hasIndexingErrors },
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.THE_GRAPH_API_KEY = TEST_API_KEY;
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.THE_GRAPH_API_KEY;
});

// ── priceStringToScaled ───────────────────────────────────────────────────────

describe("priceStringToScaled", () => {
  it("PRICE_SCALE constant is 10^PRICE_DECIMALS", () => {
    expect(PRICE_SCALE).toBe(10n ** BigInt(PRICE_DECIMALS));
    expect(PRICE_SCALE).toBe(100_000_000n);
  });

  // ── Ceiling rounding rule (Decision D-012) ─────────────────────────────────

  it("ceiling: exact value with 8 decimal places — no increment", () => {
    // Exactly representable: no tail digits → no increment.
    expect(priceStringToScaled("2476.43879727")).toBe(247_643_879_727n);
  });

  it("ceiling: short decimal padded with zeros — exact, no increment", () => {
    // "2476.5" → frac8 "50000000", tail "" → no increment.
    expect(priceStringToScaled("2476.5")).toBe(247_650_000_000n);
  });

  it("ceiling: discarded digits are all zero — exact, no increment", () => {
    // Trailing zeros beyond position 8 are harmless.
    expect(priceStringToScaled("2476.438797270000")).toBe(247_643_879_727n);
    expect(priceStringToScaled("1.000000010000000")).toBe(100_000_001n);
  });

  it("ceiling: any non-zero digit beyond position 8 — increments by 1", () => {
    // "2476.438797276...": 9th digit = "6" → +1 vs truncated value.
    expect(priceStringToScaled("2476.438797276350927976462880193061"))
      .toBe(247_643_879_728n);
    // Minimal non-zero tail: 9th digit = "1".
    expect(priceStringToScaled("1.000000001")).toBe(100_000_001n);
    // 9th digit non-zero, later digits zero — still increments.
    expect(priceStringToScaled("1.000000019")).toBe(100_000_002n);
    // Contrast: "1.000000010" has tail "0" (all-zero) → no increment.
    expect(priceStringToScaled("1.000000010")).toBe(100_000_001n);
  });

  it("ceiling: carry boundary — 1.999999999 rounds up to 2.00000000", () => {
    // frac8 = "99999999", tail = "9" → base = 199_999_999n → +1 = 200_000_000n.
    expect(priceStringToScaled("1.999999999")).toBe(200_000_000n);
  });

  it("ceiling: sub-unit price rounds up to 1 (not zero)", () => {
    // "0.000000001" → frac8 "00000000", tail "1" → +1 = 1n.
    // (truncation would have given 0n — ceiling gives the correct 1n.)
    expect(priceStringToScaled("0.000000001")).toBe(1n);
  });

  // ── Other cases ────────────────────────────────────────────────────────────

  it("converts an integer string — exact, no fractional part", () => {
    expect(priceStringToScaled("2476")).toBe(247_600_000_000n);
  });

  it("converts a very small fractional price — increments because tail is non-zero", () => {
    // "0.00040380565" → frac8 "00040380", tail "565" → +1 vs truncation.
    expect(priceStringToScaled("0.00040380565")).toBe(40_381n);
  });

  it("produces the correct ceiling value for the live fixture price", () => {
    const raw = "2476.438797276350927976462880193061";
    const scaled = priceStringToScaled(raw);
    // Integer part unchanged; fractional part = floor("43879727...") + 1.
    expect(scaled / PRICE_SCALE).toBe(2476n);
    expect(scaled % PRICE_SCALE).toBe(43_879_728n); // truncated value + 1
  });
});

// ── fetchWethUsdcEvidence ─────────────────────────────────────────────────────

describe("fetchWethUsdcEvidence — valid response", () => {
  it("returns normalized evidence and provenance for a valid fixture", async () => {
    mockFetchOk(validFixture());
    const { evidence, provenance } = await fetchWethUsdcEvidence();

    // Token identities
    expect(evidence.inputToken).toBe(WETH_ADDRESS);
    expect(evidence.outputToken).toBe(USDC_ADDRESS);

    // Price: ceiling of "2476.438797276350927976..." (tail "276..." is non-zero → +1).
    expect(evidence.price).toBe(247_643_879_728n);
    expect(typeof evidence.price).toBe("bigint");

    // Observation time: chain-derived (timestamp × 1000), NOT Date.now()
    expect(evidence.observedAtMs).toBe(1_789_303_223_000);
    expect(evidence.indexedBlock).toBe(51_256_938n);

    // Provenance
    expect(provenance.provider).toBe("TheGraph");
    expect(provenance.sourceChainId).toBe(BASE_MAINNET_CHAIN_ID);
    expect(provenance.subgraphId).toBe(GRAPH_SUBGRAPH_ID);
    expect(provenance.poolAddress).toBe(WETH_USDC_POOL_ADDRESS);
    expect(provenance.indexedBlock).toBe(51_256_938);
    expect(provenance.observedTimestampSec).toBe(1_789_303_223);
  });

  it("uses token1Price (USDC per WETH) — correct orientation for ETH price in USDC", async () => {
    // token1Price with exactly 8 decimal places — no ceiling increment.
    mockFetchOk(validFixture({ token1Price: "2476.00000000" }));
    const { evidence } = await fetchWethUsdcEvidence();
    // Should use token1Price, not token0Price (which is WETH/USDC ≈ 0.0004)
    expect(evidence.price).toBe(247_600_000_000n);
    expect(evidence.price).toBeGreaterThan(1_000_000_000n); // > $10 in 10^8 scale
  });

  it("observation time comes from block timestamp, not system clock", async () => {
    const oldBlockTimestamp = 1_700_000_000; // far in the past
    mockFetchOk(validFixture({
      metaBlock: { number: 42_000_000, timestamp: oldBlockTimestamp },
    }));
    const before = Date.now();
    const { evidence } = await fetchWethUsdcEvidence();
    const after = Date.now();

    // observedAtMs must be the block timestamp × 1000, not Date.now()
    expect(evidence.observedAtMs).toBe(oldBlockTimestamp * 1000);
    expect(evidence.observedAtMs).not.toBeGreaterThan(before);
    expect(evidence.observedAtMs).not.toBeGreaterThan(after);
  });

  it("indexedBlock is returned as bigint in evidence and as number in provenance", async () => {
    mockFetchOk(validFixture({ metaBlock: { number: 99_000_001, timestamp: 1_789_303_223 } }));
    const { evidence, provenance } = await fetchWethUsdcEvidence();
    expect(evidence.indexedBlock).toBe(99_000_001n);
    expect(provenance.indexedBlock).toBe(99_000_001);
  });

  it("does not include the API key or raw response fields in the result", async () => {
    mockFetchOk(validFixture());
    const result = await fetchWethUsdcEvidence();
    // Use a BigInt-aware replacer — the real route serializes BigInts as strings.
    const serialized = JSON.stringify(result, (_, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    );

    // No API key
    expect(serialized).not.toContain(TEST_API_KEY);
    // No raw upstream deployment hash or errors field
    expect(serialized).not.toContain("deployment");
    expect(serialized).not.toContain("feeTier");
    expect(serialized).not.toContain("liquidity");
    expect(serialized).not.toContain("token0Price");
  });
});

// ── Token orientation ─────────────────────────────────────────────────────────

describe("fetchWethUsdcEvidence — token orientation", () => {
  it("accepts the expected orientation: token0=WETH, token1=USDC", async () => {
    mockFetchOk(validFixture());
    await expect(fetchWethUsdcEvidence()).resolves.toBeDefined();
  });

  it("rejects reversed orientation: token0=USDC, token1=WETH (UNEXPECTED_TOKEN_ADDRESS)", async () => {
    mockFetchOk(
      validFixture({
        token0Id: USDC_ADDRESS.toLowerCase(), // USDC where WETH expected
        token1Id: WETH_ADDRESS.toLowerCase(), // WETH where USDC expected
        token0Decimals: String(USDC_DECIMALS),
        token1Decimals: String(WETH_DECIMALS),
      }),
    );
    await expect(fetchWethUsdcEvidence()).rejects.toMatchObject({
      code: "UNEXPECTED_TOKEN_ADDRESS",
    });
  });
});

// ── Token address and decimal validation ──────────────────────────────────────

describe("fetchWethUsdcEvidence — unexpected token address", () => {
  it("rejects token0 with a wrong address", async () => {
    mockFetchOk(
      validFixture({
        token0Id: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", // wrong address
      }),
    );
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("UNEXPECTED_TOKEN_ADDRESS");
  });

  it("rejects token1 with a wrong address", async () => {
    mockFetchOk(
      validFixture({
        token1Id: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      }),
    );
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("UNEXPECTED_TOKEN_ADDRESS");
  });
});

describe("fetchWethUsdcEvidence — unexpected token decimals", () => {
  it("rejects token0 (WETH) with wrong decimals", async () => {
    mockFetchOk(validFixture({ token0Decimals: "8" })); // 8 instead of 18
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("UNEXPECTED_TOKEN_DECIMALS");
  });

  it("rejects token1 (USDC) with wrong decimals", async () => {
    mockFetchOk(validFixture({ token1Decimals: "18" })); // 18 instead of 6
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("UNEXPECTED_TOKEN_DECIMALS");
  });
});

// ── Price validation ──────────────────────────────────────────────────────────

describe("fetchWethUsdcEvidence — price validation", () => {
  it("rejects a zero price (pool uninitialized or fully drained)", async () => {
    mockFetchOk(validFixture({ token1Price: "0" }));
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("PRICE_ZERO");
  });

  it("ceiling: sub-unit price '0.000000001' rounds to 1n — not zero, not rejected", async () => {
    // With ceiling rounding, "0.000000001" → 1n (= 0.00000001 USDC).
    // This is non-zero so it is not rejected by the PRICE_ZERO check.
    // A price of 1n is realistically implausible (ETH ≈ zero) and the
    // LTE trigger would have to be set at ≥1n to authorise — safe in practice.
    mockFetchOk(validFixture({ token1Price: "0.000000001" }));
    const result = await fetchWethUsdcEvidence();
    expect(result.evidence.price).toBe(1n);
  });

  it("rejects a malformed price string (scientific notation)", async () => {
    mockFetchOk(validFixture({ token1Price: "2.476e3" }));
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("SCHEMA_INVALID");
  });

  it("rejects a negative price string", async () => {
    mockFetchOk(validFixture({ token1Price: "-2476" }));
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("SCHEMA_INVALID");
  });

  it("rejects a price with two decimal points", async () => {
    mockFetchOk(validFixture({ token1Price: "2476.43.5" }));
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("SCHEMA_INVALID");
  });
});

// ── Missing pool ──────────────────────────────────────────────────────────────

describe("fetchWethUsdcEvidence — missing pool", () => {
  it("rejects a null pool (pool not indexed)", async () => {
    mockFetchOk(validFixture({ pool: null }));
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("POOL_NOT_FOUND");
  });
});

// ── Upstream errors ───────────────────────────────────────────────────────────

describe("fetchWethUsdcEvidence — GraphQL errors", () => {
  it("throws GraphFetchError with GRAPHQL_ERRORS kind", async () => {
    mockFetchGraphqlErrors([{ message: "subgraph is syncing" }]);
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphFetchError);
    expect((err as GraphFetchError).kind.type).toBe("GRAPHQL_ERRORS");
  });
});

describe("fetchWethUsdcEvidence — non-2xx HTTP response", () => {
  it("throws GraphFetchError with HTTP_ERROR kind on 429", async () => {
    mockFetchError(429, "Too Many Requests");
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphFetchError);
    expect((err as GraphFetchError).kind.type).toBe("HTTP_ERROR");
    expect(((err as GraphFetchError).kind as { status: number }).status).toBe(429);
  });

  it("throws GraphFetchError with HTTP_ERROR kind on 503", async () => {
    mockFetchError(503, "Service Unavailable");
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphFetchError);
    expect((err as GraphFetchError).kind.type).toBe("HTTP_ERROR");
  });
});

describe("fetchWethUsdcEvidence — request abort / timeout", () => {
  it("throws GraphFetchError with TIMEOUT kind on AbortError", async () => {
    mockFetchAbort();
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphFetchError);
    expect((err as GraphFetchError).kind.type).toBe("TIMEOUT");
  });

  it("throws GraphFetchError with NETWORK_ERROR kind on generic fetch failure", async () => {
    mockFetchNetworkError("ECONNREFUSED");
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphFetchError);
    expect((err as GraphFetchError).kind.type).toBe("NETWORK_ERROR");
  });
});

describe("fetchWethUsdcEvidence — missing API key", () => {
  it("throws GraphFetchError with CONFIGURATION_ERROR when key is absent", async () => {
    delete process.env.THE_GRAPH_API_KEY;
    // fetch should never be called — error is thrown before the request
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GraphFetchError);
    expect((err as GraphFetchError).kind.type).toBe("CONFIGURATION_ERROR");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── Block / timestamp normalization ──────────────────────────────────────────

describe("fetchWethUsdcEvidence — source block and timestamp normalization", () => {
  it("populates evidence.indexedBlock from _meta.block.number", async () => {
    mockFetchOk(validFixture({ metaBlock: { number: 55_000_000, timestamp: 1_790_000_000 } }));
    const { evidence } = await fetchWethUsdcEvidence();
    expect(evidence.indexedBlock).toBe(55_000_000n);
  });

  it("converts _meta.block.timestamp (seconds) to observedAtMs (milliseconds)", async () => {
    mockFetchOk(validFixture({ metaBlock: { number: 55_000_000, timestamp: 1_790_000_000 } }));
    const { evidence } = await fetchWethUsdcEvidence();
    expect(evidence.observedAtMs).toBe(1_790_000_000_000);
  });

  it("rejects a zero block timestamp", async () => {
    mockFetchOk(validFixture({ metaBlock: { number: 51_000_000, timestamp: 0 } }));
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("SCHEMA_INVALID");
  });

  it("rejects a negative block number", async () => {
    mockFetchOk(validFixture({ metaBlock: { number: -1, timestamp: 1_789_303_223 } }));
    const err = await fetchWethUsdcEvidence().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceFetchError);
    expect((err as EvidenceFetchError).code).toBe("SCHEMA_INVALID");
  });
});

// ── Provenance completeness ───────────────────────────────────────────────────

describe("fetchWethUsdcEvidence — provenance fields", () => {
  it("includes all required provenance fields", async () => {
    mockFetchOk(validFixture());
    const { provenance } = await fetchWethUsdcEvidence();

    expect(provenance.provider).toBe("TheGraph");
    expect(provenance.sourceChainId).toBe(BASE_MAINNET_CHAIN_ID); // 8453
    expect(provenance.subgraphId).toBe(GRAPH_SUBGRAPH_ID);
    expect(provenance.poolAddress).toBe(WETH_USDC_POOL_ADDRESS);
    expect(typeof provenance.indexedBlock).toBe("number");
    expect(typeof provenance.observedTimestampSec).toBe("number");
  });
});
