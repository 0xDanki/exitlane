/**
 * Normalized market evidence.
 *
 * Evidence comes from The Graph (or a fixture/simulation) and is normalized
 * before the policy engine sees it.  The policy engine never fetches evidence
 * itself — it receives it as a typed, already-validated value.
 *
 * Price is represented as a bigint scaled to PRICE_DECIMALS decimal places.
 * Example: ETH/USD price of $2 150.50 → 215_050_000_000n (× 10^8).
 */

import { encodeAbiParameters, keccak256 } from "viem";
import type { Hex } from "viem";
import { z } from "zod";
import { EthAddressSchema, Uint256StringSchema } from "./primitives";

/** Number of decimal places used for price values throughout the domain. */
export const PRICE_DECIMALS = 8 as const;

/** Multiplier: 10 ** PRICE_DECIMALS */
export const PRICE_SCALE = 10n ** BigInt(PRICE_DECIMALS);

/**
 * Normalized market evidence schema.
 *
 * - `inputToken` / `outputToken` — the pair the price refers to.
 * - `price` — input-token price in output-token units, scaled to PRICE_DECIMALS.
 * - `observedAtMs` — wall-clock millisecond timestamp when the evidence was
 *   observed (explicit; policy never reads the clock itself).
 * - `indexedBlock` — the block number at which The Graph indexed this price.
 */
export const MarketEvidenceSchema = z
  .object({
    inputToken: EthAddressSchema,
    outputToken: EthAddressSchema,
    /** Price scaled by 10^PRICE_DECIMALS (integer string at boundary). */
    price: Uint256StringSchema,
    /** Wall-clock ms when this evidence was captured. */
    observedAtMs: z
      .number()
      .int("observedAtMs must be an integer")
      .min(0, "observedAtMs must be non-negative"),
    /** Block number from The Graph (integer string at boundary). */
    indexedBlock: Uint256StringSchema,
  })
  .refine((d) => d.inputToken !== d.outputToken, {
    message: "inputToken and outputToken must differ",
  });

export type MarketEvidence = z.infer<typeof MarketEvidenceSchema>;

// ── Canonical evidence hash ────────────────────────────────────────────────────

const EVIDENCE_HASH_ABI = [
  { name: "inputToken", type: "address" },
  { name: "outputToken", type: "address" },
  { name: "price", type: "uint256" },
  { name: "observedAtMs", type: "uint256" },
  { name: "indexedBlock", type: "uint256" },
] as const;

/**
 * Computes a canonical Keccak-256 hash of a normalized market evidence value
 * using ABI encoding.
 *
 * Used by the `AuthorizationEnvelope` to bind the exact evidence snapshot
 * that was active when the policy was evaluated.
 *
 * Encoding: keccak256(abi.encode(inputToken, outputToken, price,
 *   observedAtMs, indexedBlock))
 */
export function hashMarketEvidence(evidence: MarketEvidence): Hex {
  const encoded = encodeAbiParameters(EVIDENCE_HASH_ABI, [
    evidence.inputToken,
    evidence.outputToken,
    evidence.price,
    BigInt(evidence.observedAtMs),
    evidence.indexedBlock,
  ]);
  return keccak256(encoded);
}
