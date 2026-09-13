/**
 * GET /api/evidence
 *
 * Returns normalized WETH/USDC market evidence from The Graph (Base mainnet).
 *
 * IMPORTANT: The Graph supplies evidence. It does NOT authorize execution.
 * Authorization is performed exclusively by evaluatePolicy() in src/domain/policy.ts.
 *
 * Behavior:
 *   - Node.js runtime, force-dynamic (no caching).
 *   - Returns 200 with validated normalized evidence and public provenance.
 *   - Returns a non-200 status with a small stable error shape on failure.
 *   - Never returns fake or stale evidence with HTTP 200.
 *   - Never returns secrets, raw upstream responses, or API keys.
 */

import { NextResponse } from "next/server";
import {
  USDC_ADDRESS,
  WETH_ADDRESS,
} from "@/config/markets";
import {
  fetchWethUsdcEvidence,
  EvidenceFetchError,
} from "@/server/graph/evidence";
import { GraphFetchError } from "@/server/graph/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Public response shape ─────────────────────────────────────────────────────

/**
 * Normalized evidence as returned by the route.
 * BigInts are serialized as decimal strings (JSON does not support BigInt).
 */
type EvidenceRouteResult =
  | {
      ok: true;
      evidence: {
        inputToken: string;
        outputToken: string;
        /** ETH price in USDC, scaled by 10^8. Decimal string. */
        price: string;
        /** Market observation time in milliseconds. Chain-derived, not Date.now(). */
        observedAtMs: number;
        /** The last indexed block number at query time. Decimal string. */
        indexedBlock: string;
        /** Price scale denominator (always 100000000 = 10^8). */
        priceScale: number;
      };
      provenance: {
        provider: "TheGraph";
        sourceChainId: number;
        subgraphId: string;
        poolAddress: string;
        indexedBlock: number;
        observedTimestampSec: number;
      };
      /** Server-side fetch time (ISO 8601). Not the market observation time. */
      fetchedAt: string;
    }
  | {
      ok: false;
      error: {
        /** Stable machine-readable code. */
        code: string;
        /** Human-readable message safe for display (no secrets). */
        message: string;
      };
    };

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse<EvidenceRouteResult>> {
  try {
    const { evidence, provenance } = await fetchWethUsdcEvidence();

    const body: EvidenceRouteResult = {
      ok: true,
      evidence: {
        inputToken: WETH_ADDRESS,
        outputToken: USDC_ADDRESS,
        // BigInt → decimal string for JSON serialization
        price: evidence.price.toString(),
        observedAtMs: evidence.observedAtMs,
        indexedBlock: evidence.indexedBlock.toString(),
        priceScale: 100_000_000, // 10^8 = PRICE_SCALE
      },
      provenance: {
        provider: provenance.provider,
        sourceChainId: provenance.sourceChainId,
        subgraphId: provenance.subgraphId,
        poolAddress: provenance.poolAddress,
        indexedBlock: provenance.indexedBlock,
        observedTimestampSec: provenance.observedTimestampSec,
      },
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    // Map typed errors to stable public codes and safe HTTP statuses.
    // Never include API keys, raw upstream payloads, or stack traces.

    if (err instanceof GraphFetchError) {
      const { kind } = err;
      switch (kind.type) {
        case "CONFIGURATION_ERROR":
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "CONFIGURATION_ERROR",
                message: "Evidence service is misconfigured.",
              },
            } satisfies EvidenceRouteResult,
            { status: 500 },
          );
        case "TIMEOUT":
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "GRAPH_UNAVAILABLE",
                message: "The Graph request timed out. Please retry.",
              },
            } satisfies EvidenceRouteResult,
            { status: 503 },
          );
        case "HTTP_ERROR":
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "GRAPH_UNAVAILABLE",
                message: `The Graph returned an upstream error (${kind.status}). Please retry.`,
              },
            } satisfies EvidenceRouteResult,
            { status: 503 },
          );
        case "NETWORK_ERROR":
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "GRAPH_UNAVAILABLE",
                message: "Could not reach The Graph. Please retry.",
              },
            } satisfies EvidenceRouteResult,
            { status: 503 },
          );
        case "GRAPHQL_ERRORS":
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "GRAPH_QUERY_ERROR",
                message: "The Graph returned query errors. Please retry.",
              },
            } satisfies EvidenceRouteResult,
            { status: 502 },
          );
      }
    }

    if (err instanceof EvidenceFetchError) {
      const isUpstream =
        err.code === "SCHEMA_INVALID" ||
        err.code === "POOL_NOT_FOUND" ||
        err.code === "UNEXPECTED_TOKEN_ADDRESS" ||
        err.code === "UNEXPECTED_TOKEN_DECIMALS" ||
        err.code === "PRICE_ZERO" ||
        err.code === "FETCH_ERROR";

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: err.code,
            message: isUpstream
              ? "Evidence validation failed. No funds moved."
              : "Evidence unavailable.",
          },
        } satisfies EvidenceRouteResult,
        { status: 502 },
      );
    }

    // Unexpected error — do not expose internals.
    console.error("[evidence] Unexpected error", err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
      } satisfies EvidenceRouteResult,
      { status: 500 },
    );
  }
}
