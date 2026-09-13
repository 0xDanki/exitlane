/**
 * Unit tests for ExecutionIntent schema and canonical execution hash.
 */
import { describe, expect, it } from "vitest";
import type { ExecutionIntent } from "./execution";
import { ExecutionIntentSchema, hashExecutionIntent } from "./execution";

// ── Fixture ───────────────────────────────────────────────────────────────────

const VALID_INTENT_RAW = {
  chainId: "84532",
  target: "0x2626664c2603336E57B271c5C0b26F421741e481",
  calldata: "0xabcdef1234",
  nativeValue: "1000000000000000000",
  inputToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  outputToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  exactInputAmount: "1000000000000000000",
  minOutputAmount: "2100000000",
  recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  slippageBps: 50,
  deadline: "1893456000",
};

function validIntent(): ExecutionIntent {
  const r = ExecutionIntentSchema.safeParse(VALID_INTENT_RAW);
  if (!r.success) throw new Error(`Fixture invalid: ${JSON.stringify(r.error.issues)}`);
  return r.data;
}

// ── Schema tests ──────────────────────────────────────────────────────────────

describe("ExecutionIntentSchema", () => {
  it("parses a valid intent", () => {
    expect(ExecutionIntentSchema.safeParse(VALID_INTENT_RAW).success).toBe(true);
  });

  it("rejects a negative chainId", () => {
    expect(
      ExecutionIntentSchema.safeParse({ ...VALID_INTENT_RAW, chainId: "-1" }).success,
    ).toBe(false);
  });

  it("rejects a decimal exactInputAmount", () => {
    expect(
      ExecutionIntentSchema.safeParse({
        ...VALID_INTENT_RAW,
        exactInputAmount: "1.5",
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid target address", () => {
    expect(
      ExecutionIntentSchema.safeParse({
        ...VALID_INTENT_RAW,
        target: "not-an-address",
      }).success,
    ).toBe(false);
  });

  it("rejects slippageBps > 10000", () => {
    expect(
      ExecutionIntentSchema.safeParse({
        ...VALID_INTENT_RAW,
        slippageBps: 10_001,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-hex calldata string", () => {
    expect(
      ExecutionIntentSchema.safeParse({
        ...VALID_INTENT_RAW,
        calldata: "notHex",
      }).success,
    ).toBe(false);
  });

  it("rejects a deadline above uint64 max (18446744073709551616)", () => {
    expect(
      ExecutionIntentSchema.safeParse({
        ...VALID_INTENT_RAW,
        deadline: "18446744073709551616",
      }).success,
    ).toBe(false);
  });

  it("accepts deadline at uint64 max boundary (18446744073709551615)", () => {
    expect(
      ExecutionIntentSchema.safeParse({
        ...VALID_INTENT_RAW,
        deadline: "18446744073709551615",
      }).success,
    ).toBe(true);
  });
});

// ── Hash tests ────────────────────────────────────────────────────────────────

describe("hashExecutionIntent", () => {
  it("returns a 32-byte hex hash", () => {
    const hash = hashExecutionIntent(validIntent());
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it("produces the same hash for identical intents", () => {
    const h1 = hashExecutionIntent(validIntent());
    const h2 = hashExecutionIntent(validIntent());
    expect(h1).toBe(h2);
  });

  it("changes hash when exactInputAmount changes", () => {
    const a = validIntent();
    const bRaw = { ...VALID_INTENT_RAW, exactInputAmount: "500000000000000000" };
    const b = ExecutionIntentSchema.parse(bRaw);
    expect(hashExecutionIntent(a)).not.toBe(hashExecutionIntent(b));
  });

  it("changes hash when recipient changes", () => {
    const a = validIntent();
    const bRaw = {
      ...VALID_INTENT_RAW,
      recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    };
    const b = ExecutionIntentSchema.parse(bRaw);
    expect(hashExecutionIntent(a)).not.toBe(hashExecutionIntent(b));
  });

  it("changes hash when target changes", () => {
    const a = validIntent();
    const bRaw = {
      ...VALID_INTENT_RAW,
      target: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    };
    const b = ExecutionIntentSchema.parse(bRaw);
    expect(hashExecutionIntent(a)).not.toBe(hashExecutionIntent(b));
  });

  it("changes hash when calldata changes by one byte", () => {
    const a = validIntent();
    const bRaw = { ...VALID_INTENT_RAW, calldata: "0xabcdef1235" }; // last byte differs
    const b = ExecutionIntentSchema.parse(bRaw);
    expect(hashExecutionIntent(a)).not.toBe(hashExecutionIntent(b));
  });

  it("changes hash when inputToken changes", () => {
    const a = validIntent();
    const bRaw = {
      ...VALID_INTENT_RAW,
      inputToken: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    };
    const b = ExecutionIntentSchema.parse(bRaw);
    expect(hashExecutionIntent(a)).not.toBe(hashExecutionIntent(b));
  });

  it("changes hash when outputToken changes", () => {
    const a = validIntent();
    const bRaw = {
      ...VALID_INTENT_RAW,
      outputToken: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    };
    const b = ExecutionIntentSchema.parse(bRaw);
    expect(hashExecutionIntent(a)).not.toBe(hashExecutionIntent(b));
  });
});
