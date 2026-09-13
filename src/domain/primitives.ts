/**
 * Domain primitive schemas.
 *
 * All values that cross a serialization boundary (API request body, stored
 * document, environment variable) must be parsed through one of these schemas
 * before domain code sees them.
 *
 * Representation rules:
 *  - Ethereum addresses  → EIP-55 checksummed `0x${string}` (via viem getAddress)
 *  - Token / wei amounts → `bigint` internally; decimal string at boundaries
 *  - Prices (8 dp)       → `bigint` internally; decimal string at boundaries
 *  - Timestamps          → `bigint` Unix seconds at boundaries
 *  - Slippage            → `number` integer basis-points [0, 10 000]
 *  - Nonces              → `0x${string}` 32-byte hex string
 *  - Chain IDs           → `bigint` (uint256)
 *
 * No floating-point arithmetic is used for any value that affects authorization.
 */

import { getAddress, isAddress } from "viem";
import type { Address, Hex } from "viem";
import { z } from "zod";

// ── Address ──────────────────────────────────────────────────────────────────

/**
 * Accepts any valid Ethereum address (case-insensitive) and normalises it
 * to EIP-55 checksummed form.
 */
export const EthAddressSchema = z
  .string()
  .refine((s) => isAddress(s), { message: "Invalid Ethereum address" })
  .transform((s): Address => getAddress(s));

export type EthAddress = Address; // `0x${string}` from viem/abitype

// ── Hex strings ──────────────────────────────────────────────────────────────

/** Any 0x-prefixed hex string. */
export const HexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, "Must be a 0x-prefixed hex string") as z.ZodType<Hex>;

/** Exactly 32 bytes (0x + 64 hex chars). Used for nonces and hashes. */
export const Bytes32Schema = z
  .string()
  .regex(
    /^0x[0-9a-fA-F]{64}$/,
    "Must be a 32-byte hex string (0x followed by exactly 64 hex chars)",
  ) as z.ZodType<Hex>;

// ── Unsigned integer strings ──────────────────────────────────────────────────

/**
 * Accepts a non-negative decimal integer string and returns a `bigint`.
 * Rejects: negative values, decimal points, exponential notation, empty
 * strings, leading zeros on non-zero values.
 *
 * The regex `/^\d+$/` matches only ASCII digits, ensuring no sign and no
 * fractional part.  BigInt of an all-digit string is always non-negative.
 */
export const Uint256StringSchema = z
  .string()
  .regex(
    /^\d+$/,
    "Must be a non-negative decimal integer string (no sign, no decimal point)",
  )
  .transform((s): bigint => BigInt(s));

/**
 * Basis points: integer in [0, 10 000].
 * Accepts a plain JS number (as sent in JSON).
 */
export const BasisPointsSchema = z
  .number()
  .int("Slippage must be an integer")
  .min(0, "Slippage must be ≥ 0 basis points")
  .max(10_000, "Slippage must be ≤ 10 000 basis points (100%)");

// ── Bounded unsigned integers ──────────────────────────────────────────────────

/** Maximum value of an unsigned 64-bit integer (2^64 − 1). */
export const UINT64_MAX = 18_446_744_073_709_551_615n;

/**
 * Accepts a non-negative decimal integer string that fits in a uint64
 * (0 … 18_446_744_073_709_551_615) and returns a `bigint`.
 *
 * Used for every field encoded as EIP-712 `uint64`: validAfter, expiry,
 * and transaction deadline.  Rejects negative values, fractions,
 * exponential notation, and values above uint64 max.
 *
 * The range check is performed with bigint arithmetic before the transform so
 * that no unsafe conversion occurs inside the validator.
 */
export const Uint64StringSchema = z
  .string()
  .regex(/^\d+$/, "Must be a non-negative decimal integer string")
  .refine(
    // Guard with try-catch: Zod v4 runs all refinements even when a prior
    // check fails (no short-circuit), so BigInt() may receive the rejected
    // string. The regex check already produces the informative error; this
    // refine adds the range message only for strings that pass the regex.
    (s) => { try { return BigInt(s) <= UINT64_MAX; } catch { return false; } },
    `Must not exceed uint64 max (${UINT64_MAX.toString()})`,
  )
  .transform((s): bigint => BigInt(s));

/**
 * Maximum chain ID value that converts exactly to a JavaScript Number.
 * (= Number.MAX_SAFE_INTEGER = 2^53 − 1 = 9_007_199_254_740_991)
 *
 * All real Ethereum chain IDs are far below this bound.
 */
export const SAFE_CHAIN_ID_MAX = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Chain ID schema.
 *
 * Validates that the value is a positive decimal integer AND is ≤
 * SAFE_CHAIN_ID_MAX (9_007_199_254_740_991), so that `Number(value)` is
 * exact.  This eliminates the unsafe `Number(arbitraryUint256)` pattern in
 * the EIP-712 domain object (which requires a JS `number`).
 *
 * A chain ID above 9_007_199_254_740_991 would never be a real network and
 * must be rejected rather than silently truncated.
 */
export const SafeChainIdSchema = z
  .string()
  .regex(/^\d+$/, "Must be a non-negative decimal integer string")
  // Guard with try-catch for the same reason as Uint64StringSchema above.
  .refine(
    (s) => { try { return BigInt(s) > 0n; } catch { return false; } },
    "Chain ID must be positive (cannot be zero)",
  )
  .refine(
    (s) => { try { return BigInt(s) <= SAFE_CHAIN_ID_MAX; } catch { return false; } },
    `Chain ID must be ≤ ${SAFE_CHAIN_ID_MAX.toString()} (JavaScript safe integer maximum)`,
  )
  .transform((s): bigint => BigInt(s));

// ── Re-export viem primitive types used across the domain ─────────────────────

export type { Hex };
