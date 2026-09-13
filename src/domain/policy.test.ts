/**
 * Deterministic unit tests for the ExitLane policy engine.
 *
 * Each test case exercises one or more policy checks using fixed private keys
 * and deterministic test vectors.  No network access is used.
 *
 * Test keys are well-known Hardhat/Foundry standard keys — NOT for production.
 */
import { signTypedData } from "viem/accounts";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { MarketEvidenceSchema } from "./evidence";
import { ExecutionIntentSchema, hashExecutionIntent } from "./execution";
import {
  EXIT_MANDATE_EIP712_TYPES,
  ExitMandateSchema,
  mandateTypedData,
} from "./mandate";
import type { PolicyInput } from "./policy";
import { evaluatePolicy } from "./policy";

// ── Test keys (Hardhat/Foundry standard test vectors — NOT for production) ────

const OWNER_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const OWNER_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const OTHER_PK =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const OTHER_ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// ── Raw fixtures ──────────────────────────────────────────────────────────────

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const NONCE =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// evaluatedAt is well within validAfter..expiry window
const EVALUATED_AT_MS = 1_750_000_000_000; // ms
const VALID_AFTER_S = "1700000000";
const EXPIRY_S = "1893456000";
const CHAIN_ID = "84532"; // Base Sepolia

const BASE_MANDATE_RAW = {
  mandateVersion: "1",
  owner: OWNER_ADDR,
  treasuryWallet: OWNER_ADDR,
  inputToken: WETH,
  outputToken: USDC,
  maxInputAmount: "25000000000000000000", // 25 ETH
  triggerComparator: "lte",
  triggerThreshold: "215000000000", // $2 150 × 10^8
  maxSlippageBps: 50,
  approvedChainId: CHAIN_ID,
  approvedRouter: ROUTER,
  outputRecipient: OWNER_ADDR,
  validAfter: VALID_AFTER_S,
  expiry: EXPIRY_S,
  nonce: NONCE,
};

const BASE_EVIDENCE_RAW = {
  inputToken: WETH,
  outputToken: USDC,
  price: "214300000000", // $2 143 × 10^8 — below $2 150 threshold → triggers
  observedAtMs: EVALUATED_AT_MS - 5_000, // 5 seconds old
  indexedBlock: "12000000",
};

const BASE_INTENT_RAW = {
  chainId: CHAIN_ID,
  target: ROUTER,
  calldata: "0xabcdef1234",
  nativeValue: "0",
  inputToken: WETH,
  outputToken: USDC,
  exactInputAmount: "25000000000000000000", // 25 ETH — exactly max
  minOutputAmount: "52817500000", // USDC output
  recipient: OWNER_ADDR,
  slippageBps: 50,
  deadline: EXPIRY_S,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAll(
  mandateRaw = BASE_MANDATE_RAW,
  evidenceRaw = BASE_EVIDENCE_RAW,
  intentRaw = BASE_INTENT_RAW,
) {
  const mandate = ExitMandateSchema.parse(mandateRaw);
  const evidence = MarketEvidenceSchema.parse(evidenceRaw);
  const intent = ExecutionIntentSchema.parse(intentRaw);
  return { mandate, evidence, intent };
}

async function buildInput(overrides: Partial<PolicyInput> = {}): Promise<PolicyInput> {
  const { mandate, evidence, intent } = parseAll();
  const td = mandateTypedData(mandate);
  const signature = await signTypedData({
    privateKey: OWNER_PK,
    types: EXIT_MANDATE_EIP712_TYPES,
    primaryType: "ExitMandate" as const,
    domain: td.domain,
    message: td.message,
  });
  // The server computes and stores this hash; it must never be accepted from the browser.
  const trustedExecutionHash = hashExecutionIntent(intent);
  return {
    mandate,
    signature,
    evidence,
    intent,
    evaluatedAtMs: EVALUATED_AT_MS,
    maxEvidenceAgeMs: 30_000,
    consumedNonces: new Set(),
    trustedExecutionHash,
    ...overrides,
  };
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe("policy — AUTHORIZED path", () => {
  it("authorizes a valid signed mandate with exact matching execution", async () => {
    const input = await buildInput();
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("AUTHORIZED");
    expect(decision.reasonCode).toBe("AUTHORIZED");
    expect(decision.executionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(decision.checks.every((c) => c.passed)).toBe(true);
    expect(decision.checks).toHaveLength(17);
  });

  it("executionHash in result matches computed hash", async () => {
    const input = await buildInput();
    const decision = await evaluatePolicy(input);
    expect(decision.executionHash).toBe(hashExecutionIntent(input.intent));
  });

  it("always returns an AuthorizationEnvelope on AUTHORIZED", async () => {
    const input = await buildInput();
    const decision = await evaluatePolicy(input);
    expect(decision.envelope).toBeDefined();
    expect(decision.envelope.policyVersion).toBe("1");
    expect(decision.envelope.outcome).toBe("AUTHORIZED");
    expect(decision.envelope.mandateHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(decision.envelope.evidenceHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(decision.envelope.executionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(decision.envelope.envelopeHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    // executionHash in envelope matches the authorized executionHash
    expect(decision.envelope.executionHash).toBe(decision.executionHash);
  });

  it("always returns an AuthorizationEnvelope on BLOCKED", async () => {
    const input = await buildInput({ evaluatedAtMs: 1_699_000_000_000 }); // NOT_YET_VALID
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.envelope).toBeDefined();
    expect(decision.envelope.policyVersion).toBe("1");
    expect(decision.envelope.outcome).toBe("BLOCKED");
    expect(decision.envelope.executionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(decision.envelope.envelopeHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});

// ── Blocking checks ───────────────────────────────────────────────────────────

describe("policy — BLOCKED: SIGNER_MISMATCH", () => {
  it("blocks when signature is from a different key", async () => {
    const input = await buildInput();
    // Override with a signature from OTHER_PK
    const td = mandateTypedData(input.mandate);
    const wrongSig = await signTypedData({
      privateKey: OTHER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const decision = await evaluatePolicy({ ...input, signature: wrongSig });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("SIGNER_MISMATCH");
    expect(decision.executionHash).toBeNull();
  });
});

describe("policy — BLOCKED: NOT_YET_VALID", () => {
  it("blocks when mandate has not yet become active", async () => {
    // Set evaluatedAt to before validAfter
    const input = await buildInput({
      evaluatedAtMs: 1_699_000_000_000, // < validAfter (1700000000 s)
    });
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("NOT_YET_VALID");
  });
});

describe("policy — BLOCKED: MANDATE_EXPIRED", () => {
  it("blocks when the mandate has expired", async () => {
    // Set evaluatedAt to after expiry (1893456000 s)
    const input = await buildInput({
      evaluatedAtMs: 1_893_456_001_000,
    });
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("MANDATE_EXPIRED");
  });
});

describe("policy — BLOCKED: WRONG_CHAIN", () => {
  it("blocks when execution targets a different chain", async () => {
    const { mandate, evidence } = parseAll();
    // Intent on mainnet (8453) but mandate approves Base Sepolia (84532).
    // Base mainnet (8453) is the evidence chain (D-002); execution MVP chain is Base Sepolia (84532).
    const intent = ExecutionIntentSchema.parse({ ...BASE_INTENT_RAW, chainId: "8453" });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const trustedExecutionHash = hashExecutionIntent(intent);
    const decision = await evaluatePolicy({
      mandate, signature, evidence, intent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("WRONG_CHAIN");
  });
});

describe("policy — BLOCKED: EVIDENCE_STALE", () => {
  it("blocks when evidence is older than maxEvidenceAgeMs", async () => {
    const input = await buildInput({ maxEvidenceAgeMs: 1_000 }); // 1 s window
    // evidence is 5 s old — exceeds 1 s window
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("EVIDENCE_STALE");
  });
});

describe("policy — BLOCKED: EVIDENCE_PAIR_MISMATCH", () => {
  it("blocks when evidence is for the wrong token pair", async () => {
    const wrongEvidence = MarketEvidenceSchema.parse({
      ...BASE_EVIDENCE_RAW,
      inputToken: USDC, // swapped
      outputToken: WETH,
    });
    const input = await buildInput({ evidence: wrongEvidence });
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("EVIDENCE_PAIR_MISMATCH");
  });
});

describe("policy — BLOCKED: TRIGGER_NOT_MET", () => {
  it("blocks when price is above the trigger threshold", async () => {
    // Price $2 200 > threshold $2 150
    const highPriceEvidence = MarketEvidenceSchema.parse({
      ...BASE_EVIDENCE_RAW,
      price: "220000000000", // $2 200 × 10^8
    });
    const input = await buildInput({ evidence: highPriceEvidence });
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("TRIGGER_NOT_MET");
  });
});

describe("policy — BLOCKED: AMOUNT_EXCEEDED", () => {
  it("blocks when exactInputAmount exceeds mandate maximum", async () => {
    const { mandate, evidence } = parseAll();
    // 26 ETH > 25 ETH max
    const intent = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      exactInputAmount: "26000000000000000000",
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const trustedExecutionHash = hashExecutionIntent(intent);
    const decision = await evaluatePolicy({
      mandate, signature, evidence, intent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("AMOUNT_EXCEEDED");
  });
});

describe("policy — BLOCKED: INPUT_TOKEN_MISMATCH", () => {
  it("blocks when input token differs from mandate", async () => {
    const { mandate, evidence } = parseAll();
    const intent = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      inputToken: OTHER_ADDR, // wrong token
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const trustedExecutionHash = hashExecutionIntent(intent);
    const decision = await evaluatePolicy({
      mandate, signature, evidence, intent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("INPUT_TOKEN_MISMATCH");
  });
});

describe("policy — BLOCKED: OUTPUT_TOKEN_MISMATCH", () => {
  it("blocks when output token differs from mandate", async () => {
    const { mandate, evidence } = parseAll();
    const intent = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      outputToken: OTHER_ADDR, // wrong token
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const trustedExecutionHash = hashExecutionIntent(intent);
    const decision = await evaluatePolicy({
      mandate, signature, evidence, intent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("OUTPUT_TOKEN_MISMATCH");
  });
});

describe("policy — BLOCKED: RECIPIENT_MISMATCH", () => {
  it("blocks when recipient differs from mandate", async () => {
    const { mandate, evidence } = parseAll();
    const intent = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      recipient: OTHER_ADDR, // wrong recipient
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const trustedExecutionHash = hashExecutionIntent(intent);
    const decision = await evaluatePolicy({
      mandate, signature, evidence, intent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("RECIPIENT_MISMATCH");
  });
});

describe("policy — BLOCKED: TARGET_NOT_APPROVED", () => {
  it("blocks when execution target is not the approved router", async () => {
    const { mandate, evidence } = parseAll();
    const intent = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      target: OTHER_ADDR, // not the approved router
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const trustedExecutionHash = hashExecutionIntent(intent);
    const decision = await evaluatePolicy({
      mandate, signature, evidence, intent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("TARGET_NOT_APPROVED");
  });
});

describe("policy — BLOCKED: SLIPPAGE_EXCEEDED", () => {
  it("blocks when slippage exceeds mandate maximum", async () => {
    const { mandate, evidence } = parseAll();
    const intent = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      slippageBps: 100, // 1% > 0.5% max
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const trustedExecutionHash = hashExecutionIntent(intent);
    const decision = await evaluatePolicy({
      mandate, signature, evidence, intent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("SLIPPAGE_EXCEEDED");
  });
});

describe("policy — BLOCKED: DEADLINE_AFTER_EXPIRY", () => {
  it("blocks when transaction deadline extends beyond mandate expiry", async () => {
    const { mandate, evidence } = parseAll();
    const intent = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      deadline: "2000000000", // after expiry (1893456000)
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    const trustedExecutionHash = hashExecutionIntent(intent);
    const decision = await evaluatePolicy({
      mandate, signature, evidence, intent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("DEADLINE_AFTER_EXPIRY");
  });
});

describe("policy — BLOCKED: NONCE_REUSED", () => {
  it("blocks when the mandate nonce is in consumedNonces", async () => {
    const consumedNonces = new Set([NONCE.toLowerCase()]);
    const input = await buildInput({ consumedNonces });
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("NONCE_REUSED");
  });
});

describe("policy — BLOCKED: EXECUTION_HASH_INCONSISTENT", () => {
  it("blocks when the trusted execution hash does not match the submitted intent", async () => {
    // The server-stored trusted hash is a zeroed sentinel — never matches any intent.
    const input = await buildInput({
      trustedExecutionHash:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    });
    const decision = await evaluatePolicy(input);
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("EXECUTION_HASH_INCONSISTENT");
  });

  it("blocks when calldata is mutated after the trusted hash was computed (Attack A)", async () => {
    // Scenario: server computed trustedHash from intentA (original calldata).
    // Attacker submits intentB (mutated calldata) with the old trusted hash.
    //
    // Policy recomputes hashExecutionIntent(intentB) ≠ trustedHash(intentA) → BLOCKED.
    const { mandate, evidence } = parseAll();
    const intentA = ExecutionIntentSchema.parse(BASE_INTENT_RAW);
    const intentB = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      calldata: "0xabcdef1235", // one byte changed post-authorization
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    // Server trusted hash was for the original intentA.
    const trustedExecutionHash = hashExecutionIntent(intentA);
    // Verify the hashes genuinely differ so this is a meaningful test.
    expect(trustedExecutionHash).not.toBe(hashExecutionIntent(intentB));

    const decision = await evaluatePolicy({
      mandate, signature, evidence,
      intent: intentB,         // attacker-submitted mutated intent
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash,    // server-stored hash of the original intent
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("EXECUTION_HASH_INCONSISTENT");
  });

  it("blocks when attacker recomputes hash for mutated calldata (Attack B)", async () => {
    // Scenario: attacker changes calldata AND recomputes the hash for the new calldata.
    // However, the policy receives the SERVER-STORED trustedExecutionHash (old).
    // The new attacker-controlled hash is never passed to the policy.
    //
    // Policy computes: hashExecutionIntent(mutatedIntent) = attackerNewHash
    // Policy compares: attackerNewHash === trustedHash(originalIntent)  → FALSE → BLOCKED
    //
    // This proves that an attacker who recomputes a fresh hash for mutated calldata
    // is still blocked as long as the API layer uses the server-stored trusted hash.
    const { mandate, evidence } = parseAll();
    const originalIntent = ExecutionIntentSchema.parse(BASE_INTENT_RAW);
    const mutatedIntent = ExecutionIntentSchema.parse({
      ...BASE_INTENT_RAW,
      calldata: "0xdeadbeef", // attacker's calldata
    });
    const td = mandateTypedData(mandate);
    const signature = await signTypedData({
      privateKey: OWNER_PK,
      types: EXIT_MANDATE_EIP712_TYPES,
      primaryType: "ExitMandate" as const,
      domain: td.domain,
      message: td.message,
    });
    // Server's trusted hash is for the original, pre-authorization intent.
    const serverTrustedHash = hashExecutionIntent(originalIntent);
    // Attacker's "new" hash — correct for the mutated intent, but differs from server's.
    const attackerNewHash = hashExecutionIntent(mutatedIntent);
    expect(attackerNewHash).not.toBe(serverTrustedHash);

    // API layer supplies serverTrustedHash (not attackerNewHash) → attacker is blocked.
    const decision = await evaluatePolicy({
      mandate, signature, evidence,
      intent: mutatedIntent,
      evaluatedAtMs: EVALUATED_AT_MS,
      maxEvidenceAgeMs: 30_000,
      consumedNonces: new Set(),
      trustedExecutionHash: serverTrustedHash, // ← server-stored; never from browser
    });
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCode).toBe("EXECUTION_HASH_INCONSISTENT");
  });
});

// ── Missing data fails closed ─────────────────────────────────────────────────

describe("policy — fails closed on missing data", () => {
  it("schema rejects missing mandatory mandate fields before reaching policy", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { nonce: _nonce, ...withoutNonce } = BASE_MANDATE_RAW;
    expect(ExitMandateSchema.safeParse(withoutNonce).success).toBe(false);
  });

  it("schema rejects missing mandatory intent fields before reaching policy", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { calldata: _cd, ...withoutCalldata } = BASE_INTENT_RAW;
    expect(ExecutionIntentSchema.safeParse(withoutCalldata).success).toBe(false);
  });
});

// ── Check count ───────────────────────────────────────────────────────────────

describe("policy — check list completeness", () => {
  it("always returns exactly 17 checks", async () => {
    // Test with multiple blocking conditions — all 17 checks still appear.
    const input = await buildInput({ evaluatedAtMs: 1_699_000_000_000 }); // NOT_YET_VALID
    const decision = await evaluatePolicy(input);
    expect(decision.checks).toHaveLength(17);
  });
});
