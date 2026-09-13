/**
 * Execution intent — schema and canonical hash.
 *
 * The execution intent describes the exact swap that the agent proposes to
 * submit.  It is constructed at trigger time from the Uniswap quote response
 * and is never known when the mandate is signed.
 *
 * Authorization-envelope relationship (Decision D-007):
 *   The mandate binds constraints (max amount, approved router, tokens,
 *   recipient, slippage, expiry).  The policy engine verifies every material
 *   field of the proposed intent against those constraints individually.
 *   If all checks pass, the policy returns an `executionHash` computed from
 *   the intent fields via ABI encoding + Keccak-256.
 *   That hash must be used as the idempotency key for the actual submission.
 *   Any single-byte mutation to the intent changes the hash, invalidating
 *   the previously authorized execution.
 *
 * All amounts are `bigint` internally; decimal strings at serialized boundaries.
 */

import { encodeAbiParameters, keccak256 } from "viem";
import type { Hex } from "viem";
import { z } from "zod";
import { BasisPointsSchema, EthAddressSchema, HexSchema, Uint256StringSchema, Uint64StringSchema } from "./primitives";

// ── Schema ────────────────────────────────────────────────────────────────────

export const ExecutionIntentSchema = z.object({
  /** Chain ID on which this execution will be submitted. */
  chainId: Uint256StringSchema,
  /** Contract address that will receive the call (approved router). */
  target: EthAddressSchema,
  /** Encoded swap calldata as produced by the Uniswap router. */
  calldata: HexSchema,
  /** Native token value (ETH in wei) sent with the call. */
  nativeValue: Uint256StringSchema,
  /** Token being sold. */
  inputToken: EthAddressSchema,
  /** Token being bought. */
  outputToken: EthAddressSchema,
  /** Exact amount of inputToken being sold (uint256 string). */
  exactInputAmount: Uint256StringSchema,
  /** Minimum acceptable output amount; execution reverts below this (uint256 string). */
  minOutputAmount: Uint256StringSchema,
  /** Address that receives the output tokens. */
  recipient: EthAddressSchema,
  /** Slippage tolerance applied by the router, in integer basis points. */
  slippageBps: BasisPointsSchema,
  /**
   * Transaction deadline as Unix seconds.
   * Encoded as EIP-712 uint64 by the router; validated to [0, 2^64-1].
   * The router will revert if this timestamp has passed.
   */
  deadline: Uint64StringSchema,
});

export type ExecutionIntent = z.infer<typeof ExecutionIntentSchema>;

// ── Canonical hash ────────────────────────────────────────────────────────────

/**
 * ABI parameter types for the canonical execution hash.
 * Order and types are stable; any change constitutes a new hash version.
 */
const EXECUTION_HASH_ABI = [
  { name: "chainId", type: "uint256" },
  { name: "target", type: "address" },
  { name: "calldata", type: "bytes" },
  { name: "nativeValue", type: "uint256" },
  { name: "inputToken", type: "address" },
  { name: "outputToken", type: "address" },
  { name: "exactInputAmount", type: "uint256" },
  { name: "minOutputAmount", type: "uint256" },
  { name: "recipient", type: "address" },
  { name: "slippageBps", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

/**
 * Computes a canonical Keccak-256 hash of an execution intent using
 * ABI encoding.
 *
 * Any mutation to any material field — including a single byte of calldata —
 * changes this hash.  The hash is used as an immutable audit fingerprint and
 * as the idempotency key for transaction submission.
 *
 * Encoding: keccak256(abi.encode(chainId, target, calldata, nativeValue,
 *   inputToken, outputToken, exactInputAmount, minOutputAmount, recipient,
 *   slippageBps, deadline))
 */
export function hashExecutionIntent(intent: ExecutionIntent): Hex {
  const encoded = encodeAbiParameters(EXECUTION_HASH_ABI, [
    intent.chainId,
    intent.target,
    intent.calldata as Hex,
    intent.nativeValue,
    intent.inputToken,
    intent.outputToken,
    intent.exactInputAmount,
    intent.minOutputAmount,
    intent.recipient,
    BigInt(intent.slippageBps),
    intent.deadline,
  ]);
  return keccak256(encoded);
}
