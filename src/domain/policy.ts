/**
 * Deterministic authorization policy engine.
 *
 * This module is the sole authorization authority for ExitLane.
 *
 * Purity constraints:
 *   - No database access.
 *   - No network calls.
 *   - No environment variable reads.
 *   - No clock reads — `evaluatedAtMs` is passed explicitly by the caller.
 *   - No global mutable state.
 *   - `consumedNonces` is a caller-supplied read-only set.
 *
 * Authorization fails closed:
 *   - Any missing or invalid required input → BLOCKED.
 *   - Any single failing check → BLOCKED.
 *   - An unknown or unsupported comparator → BLOCKED (not interpreted loosely).
 *
 * The `evaluatePolicy` function is async only because EIP-712 signature
 * recovery (`recoverTypedDataAddress` from viem) uses the Web Crypto API
 * internally.  It is otherwise referentially transparent.
 */

import { encodeAbiParameters, keccak256 } from "viem";
import type { Address, Hex } from "viem";
import type { ExitMandate } from "./mandate";
import { hashMandate, recoverMandateSigner } from "./mandate";
import type { MarketEvidence } from "./evidence";
import { hashMarketEvidence } from "./evidence";
import type { ExecutionIntent } from "./execution";
import { hashExecutionIntent } from "./execution";

// ── Reason codes ──────────────────────────────────────────────────────────────

/**
 * Stable machine-readable reason codes.
 *
 * AUTHORIZED is returned only when every check passes.
 * All other values indicate the first — or only — failing condition.
 */
export type PolicyReasonCode =
  | "AUTHORIZED"
  | "SCHEMA_INVALID" // Structural inconsistency in mandate or intent
  | "SIGNER_MISMATCH" // Recovered signer ≠ mandate.owner
  | "NOT_YET_VALID" // evaluatedAt < mandate.validAfter
  | "MANDATE_EXPIRED" // evaluatedAt ≥ mandate.expiry
  | "WRONG_CHAIN" // intent.chainId ≠ mandate.approvedChainId
  | "EVIDENCE_STALE" // evidence older than maxEvidenceAgeMs
  | "EVIDENCE_PAIR_MISMATCH" // evidence tokens ≠ mandate tokens
  | "TRIGGER_NOT_MET" // market price does not satisfy trigger
  | "AMOUNT_EXCEEDED" // intent.exactInputAmount > mandate.maxInputAmount
  | "INPUT_TOKEN_MISMATCH" // intent.inputToken ≠ mandate.inputToken
  | "OUTPUT_TOKEN_MISMATCH" // intent.outputToken ≠ mandate.outputToken
  | "RECIPIENT_MISMATCH" // intent.recipient ≠ mandate.outputRecipient
  | "TARGET_NOT_APPROVED" // intent.target ≠ mandate.approvedRouter
  | "SLIPPAGE_EXCEEDED" // intent.slippageBps > mandate.maxSlippageBps
  | "DEADLINE_AFTER_EXPIRY" // intent.deadline > mandate.expiry
  | "NONCE_REUSED" // nonce already in consumedNonces
  | "EXECUTION_HASH_INCONSISTENT"; // proposedExecutionHash ≠ computed hash

// ── Result types ──────────────────────────────────────────────────────────────

/** Result of a single policy check. */
export type CheckResult = {
  /** Short human-readable name, suitable for the evidence table. */
  name: string;
  /** Stable reason code identifying this check. */
  reasonCode: PolicyReasonCode;
  /** The value required by the mandate or policy rule. */
  expected: string;
  /** The value observed in the evidence or intent. */
  observed: string;
  /** Whether this check passed. */
  passed: boolean;
  /**
   * Plain-language explanation of this check's result.
   * Safe to display in the operator UI.
   */
  explanation: string;
};

// ── Authorization envelope ────────────────────────────────────────────────────

/**
 * AuthorizationEnvelope — server-side audit record and anti-substitution anchor.
 *
 * The envelope binds the exact mandate, evidence snapshot, and execution intent
 * that were present when the policy was evaluated.  It is computed by the
 * policy engine (not user-supplied) and is hashed canonically for auditability.
 *
 * IMPORTANT: The envelope is NOT user-signed.  It is a server-side construct.
 * Its purpose is:
 *   1. Auditability: an immutable record of what was authorized and why.
 *   2. Anti-substitution: the `executionHash` in the envelope is the trusted
 *      value the API layer must compare against the actual transaction payload
 *      immediately before submission.  A post-authorization mutation to any
 *      material execution field produces a different hash, preventing silent
 *      substitution between authorization and execution.
 *
 * The API layer MUST:
 *   - Store the envelope server-side after each policy evaluation.
 *   - Never accept `executionHash` as authoritative from the browser.
 *   - Before submitting a transaction, recompute hashExecutionIntent(actualIntent)
 *     and require exact equality with envelope.executionHash.
 */
export type AuthorizationEnvelope = {
  /** Policy engine version. Increment when behavior changes. */
  readonly policyVersion: "1";
  /** EIP-712 hash of the signed Exit Mandate (result of hashMandate). */
  readonly mandateHash: Hex;
  /** Canonical hash of the normalized market evidence snapshot. */
  readonly evidenceHash: Hex;
  /**
   * Canonical hash of the proposed ExecutionIntent.
   * Always computed by the policy engine; never supplied by the caller.
   * This is the trusted idempotency key: the API layer must recompute and
   * require exact equality with this value before actual execution.
   */
  readonly executionHash: Hex;
  /** Wall-clock evaluation timestamp in milliseconds (as supplied to evaluatePolicy). */
  readonly evaluatedAtMs: number;
  /** Policy outcome at evaluation time. */
  readonly outcome: "AUTHORIZED" | "BLOCKED";
  /**
   * keccak256(abi.encode(policyVersion, mandateHash, evidenceHash,
   *   executionHash, evaluatedAtMs, outcomeAsString))
   *
   * Canonical fingerprint of the entire envelope.  If any field is tampered
   * the fingerprint will not match.  Not user-signed; for server audit log.
   */
  readonly envelopeHash: Hex;
};

const ENVELOPE_HASH_ABI = [
  { name: "policyVersion", type: "string" },
  { name: "mandateHash", type: "bytes32" },
  { name: "evidenceHash", type: "bytes32" },
  { name: "executionHash", type: "bytes32" },
  { name: "evaluatedAtMs", type: "uint256" },
  { name: "outcome", type: "string" },
] as const;

function buildEnvelope(
  mandateHash: Hex,
  evidenceHash: Hex,
  executionHash: Hex,
  evaluatedAtMs: number,
  outcome: "AUTHORIZED" | "BLOCKED",
): AuthorizationEnvelope {
  const envelopeHash = keccak256(
    encodeAbiParameters(ENVELOPE_HASH_ABI, [
      "1",
      mandateHash as Hex,
      evidenceHash as Hex,
      executionHash as Hex,
      BigInt(evaluatedAtMs),
      outcome,
    ]),
  );
  return {
    policyVersion: "1",
    mandateHash,
    evidenceHash,
    executionHash,
    evaluatedAtMs,
    outcome,
    envelopeHash,
  };
}

/** Final policy decision. */
export type PolicyDecision = {
  /** AUTHORIZED only if every check passed. */
  outcome: "AUTHORIZED" | "BLOCKED";
  /**
   * Reason code of the first failing check, or AUTHORIZED.
   * Stable and machine-readable; suitable for error logging and API codes.
   */
  reasonCode: PolicyReasonCode;
  /** Ordered list of all checks performed, including passing ones. */
  checks: CheckResult[];
  /**
   * Canonical execution hash, present only when outcome is AUTHORIZED.
   * Must be used as the idempotency key for the actual transaction submission.
   * Any mutation to the intent produces a different hash and voids this
   * authorization.
   */
  executionHash: Hex | null;
  /**
   * Server-side authorization envelope.  Always present (AUTHORIZED or BLOCKED).
   * The API layer must persist this and use `envelope.executionHash` as the
   * trusted hash before execution — never accept a hash from the browser.
   */
  envelope: AuthorizationEnvelope;
};

// ── Input ─────────────────────────────────────────────────────────────────────

export type PolicyInput = {
  /** Fully parsed, schema-validated Exit Mandate. */
  mandate: ExitMandate;
  /**
   * EIP-712 signature over the mandate, produced by mandate.owner.
   * Hex string (0x-prefixed).
   */
  signature: Hex;
  /** Normalized market evidence from The Graph (or a fixture). */
  evidence: MarketEvidence;
  /** Proposed execution as constructed from the Uniswap quote. */
  intent: ExecutionIntent;
  /**
   * Wall-clock time at which authorization is evaluated, in milliseconds.
   * Must be supplied explicitly by the caller — the engine never reads
   * Date.now() or any other clock.
   */
  evaluatedAtMs: number;
  /**
   * Maximum acceptable age of `evidence`, in milliseconds.
   * Evidence older than this value fails the EVIDENCE_STALE check.
   */
  maxEvidenceAgeMs: number;
  /**
   * Set of nonces that have already been consumed.
   * The engine never mutates this set; the caller is responsible for
   * atomically adding the nonce after a successful execution.
   */
  consumedNonces: ReadonlySet<string>;
  /**
   * The trusted execution hash that the server computed and stored when it
   * constructed `intent` from the validated Uniswap response.
   *
   * TRUST BOUNDARY — this must NEVER be accepted from the browser:
   *   - The server constructs `intent` from a validated Uniswap quote.
   *   - The server immediately calls hashExecutionIntent(intent) and stores
   *     the result server-side (e.g., in a session or short-lived store).
   *   - That stored value is passed here as `trustedExecutionHash`.
   *   - The engine recomputes the hash from `intent` and requires exact equality.
   *   - Any calldata mutation or other material change → EXECUTION_HASH_INCONSISTENT.
   *
   * An attacker who recomputes the hash for a mutated intent will still be
   * blocked because their new hash differs from the server-stored trusted value.
   */
  trustedExecutionHash: Hex;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function passed(
  name: string,
  reasonCode: PolicyReasonCode,
  expected: string,
  observed: string,
  explanation: string,
): CheckResult {
  return { name, reasonCode, expected, observed, passed: true, explanation };
}

function failed(
  name: string,
  reasonCode: PolicyReasonCode,
  expected: string,
  observed: string,
  explanation: string,
): CheckResult {
  return { name, reasonCode, expected, observed, passed: false, explanation };
}

function addrEq(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function bigintToUnixSeconds(ms: number): bigint {
  return BigInt(Math.floor(ms / 1000));
}

// ── Policy engine ─────────────────────────────────────────────────────────────

/**
 * Evaluates whether the proposed execution is authorized under the signed
 * mandate, given current market evidence.
 *
 * The function is async because EIP-712 signature recovery is async.
 * All other operations are synchronous and deterministic.
 *
 * Authorization requires every one of the checks below to pass.
 * The first failing check determines `reasonCode`.
 */
export async function evaluatePolicy(
  input: PolicyInput,
): Promise<PolicyDecision> {
  const {
    mandate,
    signature,
    evidence,
    intent,
    evaluatedAtMs,
    maxEvidenceAgeMs,
    consumedNonces,
    trustedExecutionHash,
  } = input;
  const evaluatedAtSec = bigintToUnixSeconds(evaluatedAtMs);
  const checks: CheckResult[] = [];

  // Pre-compute stable hashes for the envelope (always built, regardless of outcome).
  const mandateHash = hashMandate(mandate);
  const evidenceHash = hashMarketEvidence(evidence);

  // ── 1. Schema / structural integrity ──────────────────────────────────────
  // Cross-field invariants that Zod enforced at parse time are verified here
  // as defence-in-depth.  If the mandate object is structurally sound these
  // checks always pass.

  const schemaOk =
    mandate.mandateVersion === "1" &&
    mandate.expiry > mandate.validAfter &&
    mandate.inputToken !== mandate.outputToken;

  checks.push(
    schemaOk
      ? passed(
          "Schema valid",
          "SCHEMA_INVALID",
          "mandateVersion=1, expiry>validAfter, inputToken≠outputToken",
          "mandateVersion=1, expiry>validAfter, inputToken≠outputToken",
          "Mandate structure is internally consistent.",
        )
      : failed(
          "Schema valid",
          "SCHEMA_INVALID",
          "mandateVersion=1, expiry>validAfter, inputToken≠outputToken",
          "One or more invariants violated",
          "The mandate failed an internal consistency check.",
        ),
  );

  // ── 2. Signer ─────────────────────────────────────────────────────────────
  let recoveredSigner: Address;
  try {
    recoveredSigner = await recoverMandateSigner(mandate, signature);
  } catch {
    // Signature is unparseable — treat as mismatch.
    recoveredSigner = "0x0000000000000000000000000000000000000000";
  }
  const signerOk = addrEq(recoveredSigner, mandate.owner);
  checks.push(
    signerOk
      ? passed(
          "Correct signer",
          "SIGNER_MISMATCH",
          mandate.owner,
          recoveredSigner,
          "The signature was produced by mandate.owner.",
        )
      : failed(
          "Correct signer",
          "SIGNER_MISMATCH",
          mandate.owner,
          recoveredSigner,
          "The signature was not produced by mandate.owner. No funds moved.",
        ),
  );

  // ── 3. Valid-after ────────────────────────────────────────────────────────
  const validAfterOk = evaluatedAtSec >= mandate.validAfter;
  checks.push(
    validAfterOk
      ? passed(
          "Valid-after reached",
          "NOT_YET_VALID",
          `≥ ${mandate.validAfter.toString()} s`,
          `${evaluatedAtSec.toString()} s`,
          "The mandate's valid-after window has opened.",
        )
      : failed(
          "Valid-after reached",
          "NOT_YET_VALID",
          `≥ ${mandate.validAfter.toString()} s`,
          `${evaluatedAtSec.toString()} s`,
          `The mandate is not yet active. It becomes active at Unix second ${mandate.validAfter.toString()}.`,
        ),
  );

  // ── 4. Expiry ─────────────────────────────────────────────────────────────
  const notExpiredOk = evaluatedAtSec < mandate.expiry;
  checks.push(
    notExpiredOk
      ? passed(
          "Not expired",
          "MANDATE_EXPIRED",
          `< ${mandate.expiry.toString()} s`,
          `${evaluatedAtSec.toString()} s`,
          "The mandate has not expired.",
        )
      : failed(
          "Not expired",
          "MANDATE_EXPIRED",
          `< ${mandate.expiry.toString()} s`,
          `${evaluatedAtSec.toString()} s`,
          "The mandate has expired. No funds moved.",
        ),
  );

  // ── 5. Correct chain ──────────────────────────────────────────────────────
  const chainOk = intent.chainId === mandate.approvedChainId;
  checks.push(
    chainOk
      ? passed(
          "Correct chain",
          "WRONG_CHAIN",
          mandate.approvedChainId.toString(),
          intent.chainId.toString(),
          "Execution chain matches the signed mandate.",
        )
      : failed(
          "Correct chain",
          "WRONG_CHAIN",
          mandate.approvedChainId.toString(),
          intent.chainId.toString(),
          "The proposed execution targets a different chain than the signed mandate. No funds moved.",
        ),
  );

  // ── 6. Evidence freshness ─────────────────────────────────────────────────
  const evidenceAgeMs = evaluatedAtMs - evidence.observedAtMs;
  const freshnessOk = evidenceAgeMs >= 0 && evidenceAgeMs <= maxEvidenceAgeMs;
  checks.push(
    freshnessOk
      ? passed(
          "Fresh evidence",
          "EVIDENCE_STALE",
          `≤ ${maxEvidenceAgeMs} ms old`,
          `${evidenceAgeMs} ms old`,
          `Market evidence is ${evidenceAgeMs} ms old — within the ${maxEvidenceAgeMs} ms freshness window.`,
        )
      : failed(
          "Fresh evidence",
          "EVIDENCE_STALE",
          `≤ ${maxEvidenceAgeMs} ms old`,
          `${evidenceAgeMs} ms old`,
          `Market evidence is ${evidenceAgeMs} ms old, exceeding the ${maxEvidenceAgeMs} ms freshness window. No funds moved.`,
        ),
  );

  // ── 7. Evidence token pair ────────────────────────────────────────────────
  const pairOk =
    addrEq(evidence.inputToken, mandate.inputToken) &&
    addrEq(evidence.outputToken, mandate.outputToken);
  checks.push(
    pairOk
      ? passed(
          "Evidence pair matches",
          "EVIDENCE_PAIR_MISMATCH",
          `${mandate.inputToken}/${mandate.outputToken}`,
          `${evidence.inputToken}/${evidence.outputToken}`,
          "Market evidence is for the correct token pair.",
        )
      : failed(
          "Evidence pair matches",
          "EVIDENCE_PAIR_MISMATCH",
          `${mandate.inputToken}/${mandate.outputToken}`,
          `${evidence.inputToken}/${evidence.outputToken}`,
          "Market evidence is for a different token pair than the mandate. No funds moved.",
        ),
  );

  // ── 8. Trigger condition ──────────────────────────────────────────────────
  // Only "lte" is supported (schema enforces this; defence-in-depth check here).
  const triggerOk =
    mandate.triggerComparator === "lte" &&
    evidence.price <= mandate.triggerThreshold;
  checks.push(
    triggerOk
      ? passed(
          "Trigger condition met",
          "TRIGGER_NOT_MET",
          `price ≤ ${mandate.triggerThreshold.toString()} (scaled)`,
          `price = ${evidence.price.toString()} (scaled)`,
          `Market price (${evidence.price.toString()}) is at or below the trigger threshold (${mandate.triggerThreshold.toString()}).`,
        )
      : failed(
          "Trigger condition met",
          "TRIGGER_NOT_MET",
          `price ≤ ${mandate.triggerThreshold.toString()} (scaled)`,
          `price = ${evidence.price.toString()} (scaled)`,
          `Market price (${evidence.price.toString()}) has not reached the trigger threshold (${mandate.triggerThreshold.toString()}). No funds moved.`,
        ),
  );

  // ── 9. Amount within maximum ──────────────────────────────────────────────
  const amountOk = intent.exactInputAmount <= mandate.maxInputAmount;
  checks.push(
    amountOk
      ? passed(
          "Amount within maximum",
          "AMOUNT_EXCEEDED",
          `≤ ${mandate.maxInputAmount.toString()} wei`,
          `${intent.exactInputAmount.toString()} wei`,
          "The proposed input amount is within the signed maximum.",
        )
      : failed(
          "Amount within maximum",
          "AMOUNT_EXCEEDED",
          `≤ ${mandate.maxInputAmount.toString()} wei`,
          `${intent.exactInputAmount.toString()} wei`,
          `The proposed amount (${intent.exactInputAmount.toString()}) exceeds the signed maximum (${mandate.maxInputAmount.toString()}). No funds moved.`,
        ),
  );

  // ── 10. Exact input token ─────────────────────────────────────────────────
  const inputTokenOk = addrEq(intent.inputToken, mandate.inputToken);
  checks.push(
    inputTokenOk
      ? passed(
          "Exact input token",
          "INPUT_TOKEN_MISMATCH",
          mandate.inputToken,
          intent.inputToken,
          "The input token matches the signed mandate.",
        )
      : failed(
          "Exact input token",
          "INPUT_TOKEN_MISMATCH",
          mandate.inputToken,
          intent.inputToken,
          "The proposed input token differs from the signed mandate. No funds moved.",
        ),
  );

  // ── 11. Exact output token ────────────────────────────────────────────────
  const outputTokenOk = addrEq(intent.outputToken, mandate.outputToken);
  checks.push(
    outputTokenOk
      ? passed(
          "Exact output token",
          "OUTPUT_TOKEN_MISMATCH",
          mandate.outputToken,
          intent.outputToken,
          "The output token matches the signed mandate.",
        )
      : failed(
          "Exact output token",
          "OUTPUT_TOKEN_MISMATCH",
          mandate.outputToken,
          intent.outputToken,
          "The proposed output token differs from the signed mandate. No funds moved.",
        ),
  );

  // ── 12. Exact recipient ───────────────────────────────────────────────────
  const recipientOk = addrEq(intent.recipient, mandate.outputRecipient);
  checks.push(
    recipientOk
      ? passed(
          "Exact recipient",
          "RECIPIENT_MISMATCH",
          mandate.outputRecipient,
          intent.recipient,
          "The output recipient matches the signed mandate.",
        )
      : failed(
          "Exact recipient",
          "RECIPIENT_MISMATCH",
          mandate.outputRecipient,
          intent.recipient,
          "The proposed recipient differs from the signed mandate. No funds moved.",
        ),
  );

  // ── 13. Approved execution target ─────────────────────────────────────────
  const targetOk = addrEq(intent.target, mandate.approvedRouter);
  checks.push(
    targetOk
      ? passed(
          "Approved execution target",
          "TARGET_NOT_APPROVED",
          mandate.approvedRouter,
          intent.target,
          "The execution target is the approved router.",
        )
      : failed(
          "Approved execution target",
          "TARGET_NOT_APPROVED",
          mandate.approvedRouter,
          intent.target,
          "The proposed execution target is not the approved router. No funds moved.",
        ),
  );

  // ── 14. Slippage within maximum ───────────────────────────────────────────
  const slippageOk = intent.slippageBps <= mandate.maxSlippageBps;
  checks.push(
    slippageOk
      ? passed(
          "Slippage within maximum",
          "SLIPPAGE_EXCEEDED",
          `≤ ${mandate.maxSlippageBps} bps`,
          `${intent.slippageBps} bps`,
          "The proposed slippage is within the signed maximum.",
        )
      : failed(
          "Slippage within maximum",
          "SLIPPAGE_EXCEEDED",
          `≤ ${mandate.maxSlippageBps} bps`,
          `${intent.slippageBps} bps`,
          `The proposed slippage (${intent.slippageBps} bps) exceeds the signed maximum (${mandate.maxSlippageBps} bps). No funds moved.`,
        ),
  );

  // ── 15. Deadline within mandate expiry ────────────────────────────────────
  const deadlineOk = intent.deadline <= mandate.expiry;
  checks.push(
    deadlineOk
      ? passed(
          "Deadline within expiry",
          "DEADLINE_AFTER_EXPIRY",
          `≤ ${mandate.expiry.toString()} s`,
          `${intent.deadline.toString()} s`,
          "The transaction deadline falls within the mandate's expiry.",
        )
      : failed(
          "Deadline within expiry",
          "DEADLINE_AFTER_EXPIRY",
          `≤ ${mandate.expiry.toString()} s`,
          `${intent.deadline.toString()} s`,
          "The transaction deadline extends beyond the mandate's expiry. No funds moved.",
        ),
  );

  // ── 16. Nonce unused ──────────────────────────────────────────────────────
  const nonceKey = mandate.nonce.toLowerCase();
  const nonceOk = !consumedNonces.has(nonceKey);
  checks.push(
    nonceOk
      ? passed(
          "Nonce unused",
          "NONCE_REUSED",
          "unused",
          "unused",
          "The mandate nonce has not been used before.",
        )
      : failed(
          "Nonce unused",
          "NONCE_REUSED",
          "unused",
          "consumed",
          "This mandate's nonce has already been used. Execution is not idempotent. No funds moved.",
        ),
  );

  // ── 17. Execution hash consistent ─────────────────────────────────────────
  //
  // The engine computes the hash from the submitted intent and compares it to
  // the TRUSTED hash stored server-side (trustedExecutionHash).
  //
  // Two attack vectors this blocks:
  //   A) Calldata mutation: attacker changes intent.calldata after the trusted
  //      hash was computed.  computedHash ≠ trustedExecutionHash → BLOCKED.
  //   B) Hash substitution: attacker recomputes a hash for their mutated
  //      intent and provides it as the "proposed" hash.  However, the policy
  //      receives the server-stored trustedExecutionHash (not the browser
  //      request body), so the new attacker-controlled hash never reaches the
  //      comparison — their mutation still changes computedHash away from the
  //      trusted value → BLOCKED.
  const computedHash = hashExecutionIntent(intent);
  const hashOk =
    trustedExecutionHash.toLowerCase() === computedHash.toLowerCase();
  checks.push(
    hashOk
      ? passed(
          "Execution hash consistent",
          "EXECUTION_HASH_INCONSISTENT",
          computedHash,
          trustedExecutionHash,
          "The intent recomputes to the server-trusted execution hash.",
        )
      : failed(
          "Execution hash consistent",
          "EXECUTION_HASH_INCONSISTENT",
          computedHash,
          trustedExecutionHash,
          "The intent's recomputed hash does not match the server-trusted execution hash. The execution payload may have been tampered with. No funds moved.",
        ),
  );

  // ── Final decision ────────────────────────────────────────────────────────
  const firstFailure = checks.find((c) => !c.passed);
  if (firstFailure !== undefined) {
    const envelope = buildEnvelope(
      mandateHash,
      evidenceHash,
      computedHash,
      evaluatedAtMs,
      "BLOCKED",
    );
    return {
      outcome: "BLOCKED",
      reasonCode: firstFailure.reasonCode,
      checks,
      executionHash: null,
      envelope,
    };
  }

  const envelope = buildEnvelope(
    mandateHash,
    evidenceHash,
    computedHash,
    evaluatedAtMs,
    "AUTHORIZED",
  );
  return {
    outcome: "AUTHORIZED",
    reasonCode: "AUTHORIZED",
    checks,
    executionHash: computedHash,
    envelope,
  };
}
