/**
 * Exit Mandate — schema, EIP-712 typed-data helpers, and signature utilities.
 *
 * Off-chain verification design (Decision D-007):
 *   ExitLane has no deployed verifying contract in the ETHOnline 2026 demo.
 *   Signature verification is performed off-chain by recovering the signer
 *   address from the EIP-712 hash and comparing it to mandate.owner.
 *   The domain does NOT include `verifyingContract`.
 *
 *   Risks of omitting verifyingContract (corrected analysis):
 *
 *   1. Knowing an owner address does NOT enable signature forgery.  An attacker
 *      cannot produce a valid EIP-712 signature for an address they do not
 *      control; that would break ECDSA.
 *
 *   2. Weaker deployment-level domain separation: two ExitLane deployments on
 *      the same chain (e.g., staging and production) sharing the same domain
 *      name "ExitLane" and version "1" would share the same domain separator.
 *      A mandate signed for staging could be replayed on production because
 *      their domain separators are identical.  `verifyingContract` differentiates
 *      them by making the contract address part of the separator.
 *
 *   3. Cross-application replay: any application that constructs the identical
 *      EIP-712 domain (name, version, chainId) and the same typed-data struct
 *      could produce a hash indistinguishable from an ExitLane mandate.
 *      This is mitigated by ExitLane's unique struct layout (15 fields) but
 *      is not eliminated without `verifyingContract`.
 *
 *   4. API-layer Privy ownership check (separate concern):
 *      The policy engine verifies only that the signature was produced by
 *      `mandate.owner`.  The API layer must independently verify that
 *      `mandate.owner` is the wallet address associated with the authenticated
 *      Privy user session.  Without this check, an operator who knows another
 *      user's wallet address could submit mandates claiming to be that user.
 *
 *   These are POC limitations.  Add `verifyingContract` before production.
 *   See docs/DECISIONS.md Decision D-007.
 *
 * Chain binding:
 *   `approvedChainId` is present in both the EIP-712 domain (`chainId` field)
 *   and the mandate message.  Domain binding prevents replay on the wrong
 *   chain.  Message binding makes the intended chain part of the signed data.
 *
 * Trigger comparator:
 *   Only "lte" (price ≤ threshold) is supported in v1.  Any other comparator
 *   is rejected at parse time.
 */

import { hashTypedData, recoverTypedDataAddress } from "viem";
import type { Address, Hex } from "viem";
import { z } from "zod";
import {
  Bytes32Schema,
  BasisPointsSchema,
  EthAddressSchema,
  SafeChainIdSchema,
  Uint256StringSchema,
  Uint64StringSchema,
} from "./primitives";

// ── Constants ─────────────────────────────────────────────────────────────────

export const EXITLANE_DOMAIN_NAME = "ExitLane" as const;
export const EXITLANE_DOMAIN_VERSION = "1" as const;
export const MANDATE_VERSION = "1" as const;

/**
 * EIP-712 typed data field definitions for ExitMandate.
 * Field order is stable and must not be changed without a new mandate version.
 */
export const EXIT_MANDATE_EIP712_TYPES = {
  ExitMandate: [
    { name: "mandateVersion", type: "string" },
    { name: "owner", type: "address" },
    { name: "treasuryWallet", type: "address" },
    { name: "inputToken", type: "address" },
    { name: "outputToken", type: "address" },
    { name: "maxInputAmount", type: "uint256" },
    { name: "triggerComparator", type: "string" },
    { name: "triggerThreshold", type: "uint256" },
    { name: "maxSlippageBps", type: "uint256" },
    { name: "approvedChainId", type: "uint256" },
    { name: "approvedRouter", type: "address" },
    { name: "outputRecipient", type: "address" },
    { name: "validAfter", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ── Schema ────────────────────────────────────────────────────────────────────

/**
 * Exit Mandate schema.
 *
 * All numeric fields travel as decimal strings at serialization boundaries
 * and are `bigint` internally.  `maxSlippageBps` is a plain JS number
 * (integer basis points fit safely in Number).
 *
 * Cross-field invariants enforced here:
 *   - expiry must be strictly after validAfter
 *   - inputToken and outputToken must differ
 */
export const ExitMandateSchema = z
  .object({
    /** Schema version. Only "1" is accepted. */
    mandateVersion: z.literal(MANDATE_VERSION),
    /** Ethereum address of the treasury owner who signed the mandate. */
    owner: EthAddressSchema,
    /** Treasury wallet whose funds are being protected. */
    treasuryWallet: EthAddressSchema,
    /** Token to sell (input to the swap). */
    inputToken: EthAddressSchema,
    /** Token to buy (output of the swap). */
    outputToken: EthAddressSchema,
    /** Maximum amount of inputToken that may be sold (wei, uint256 string). */
    maxInputAmount: Uint256StringSchema,
    /**
     * Price comparison direction.
     * Only "lte" (price ≤ threshold) is supported in v1.
     */
    triggerComparator: z.literal("lte", {
      error: 'Only "lte" (price at or below threshold) is supported in v1',
    }),
    /**
     * Price threshold scaled by 10^8 (PRICE_DECIMALS).
     * Execution may only proceed when market price satisfies the comparator
     * relative to this threshold.
     */
    triggerThreshold: Uint256StringSchema,
    /** Maximum acceptable slippage in integer basis points [0, 10 000]. */
    maxSlippageBps: BasisPointsSchema,
    /**
     * Chain ID on which execution is permitted.
     * Constrained to JavaScript safe-integer range so that conversion to
     * Number (required by the viem EIP-712 domain type) is exact.
     * All real Ethereum chain IDs are far below this ceiling.
     * See docs/DECISIONS.md Decision D-009.
     */
    approvedChainId: SafeChainIdSchema,
    /** Contract address of the approved execution router/target. */
    approvedRouter: EthAddressSchema,
    /** Address that must receive the output tokens. */
    outputRecipient: EthAddressSchema,
    /**
     * Earliest Unix timestamp (seconds) at which the mandate is active.
     * Encoded as EIP-712 uint64; validated to [0, 2^64-1].
     */
    validAfter: Uint64StringSchema,
    /**
     * Unix timestamp (seconds) after which the mandate is expired.
     * Encoded as EIP-712 uint64; validated to [0, 2^64-1].
     * Must be strictly after validAfter.
     */
    expiry: Uint64StringSchema,
    /**
     * 32-byte random value that makes this mandate unique and prevents replay.
     * Must be consumed atomically on execution.
     */
    nonce: Bytes32Schema,
  })
  .refine((d) => d.expiry > d.validAfter, {
    message: "expiry must be strictly after validAfter",
    path: ["expiry"],
  })
  .refine((d) => d.inputToken !== d.outputToken, {
    message: "inputToken and outputToken must differ",
    path: ["outputToken"],
  });

export type ExitMandate = z.infer<typeof ExitMandateSchema>;

// ── EIP-712 helpers ───────────────────────────────────────────────────────────

/**
 * Constructs the EIP-712 typed-data object for a mandate.
 * Suitable for `hashTypedData`, `recoverTypedDataAddress`, and off-chain
 * signing tools.
 *
 * Chain ID is bound in the domain AND in the message.
 * The domain does not include `verifyingContract` (off-chain verification
 * design — see module docstring and Decision D-006).
 */
export function mandateTypedData(mandate: ExitMandate) {
  return {
    types: EXIT_MANDATE_EIP712_TYPES,
    primaryType: "ExitMandate" as const,
    domain: {
      name: EXITLANE_DOMAIN_NAME,
      version: EXITLANE_DOMAIN_VERSION,
      // viem's TypedDataDomain requires chainId as a JS number.
      // SafeChainIdSchema (used for approvedChainId) guarantees the value is
      // ≤ Number.MAX_SAFE_INTEGER, so this conversion is exact — not an
      // arbitrary uint256 truncation.  See Decision D-009.
      chainId: Number(mandate.approvedChainId),
    },
    message: {
      mandateVersion: mandate.mandateVersion,
      owner: mandate.owner,
      treasuryWallet: mandate.treasuryWallet,
      inputToken: mandate.inputToken,
      outputToken: mandate.outputToken,
      maxInputAmount: mandate.maxInputAmount,
      triggerComparator: mandate.triggerComparator,
      triggerThreshold: mandate.triggerThreshold,
      // maxSlippageBps is stored as JS number; EIP-712 uint256 needs bigint.
      maxSlippageBps: BigInt(mandate.maxSlippageBps),
      approvedChainId: mandate.approvedChainId,
      approvedRouter: mandate.approvedRouter,
      outputRecipient: mandate.outputRecipient,
      validAfter: mandate.validAfter,
      expiry: mandate.expiry,
      nonce: mandate.nonce as Hex,
    },
  } as const;
}

/**
 * Returns the EIP-712 hash of the mandate (synchronous).
 * This is the value that the owner signs.
 */
export function hashMandate(mandate: ExitMandate): Hex {
  return hashTypedData(mandateTypedData(mandate));
}

/**
 * Recovers the address that produced `signature` over the mandate's EIP-712
 * hash.  The recovered address may then be compared to `mandate.owner`.
 */
export async function recoverMandateSigner(
  mandate: ExitMandate,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    ...mandateTypedData(mandate),
    signature,
  });
}

/**
 * Returns `true` only if `signature` was produced by `expectedOwner` over
 * the mandate's EIP-712 hash.  Case-insensitive address comparison.
 */
export async function verifyMandateSigner(
  mandate: ExitMandate,
  signature: Hex,
  expectedOwner: Address,
): Promise<boolean> {
  const recovered = await recoverMandateSigner(mandate, signature);
  return recovered.toLowerCase() === expectedOwner.toLowerCase();
}
