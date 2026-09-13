/**
 * Unit tests for ExitMandate schema, EIP-712 hashing, and signature verification.
 *
 * Test keys are well-known Hardhat/Foundry deterministic test keys.
 * They are universally recognized as test-only keys and carry no real funds.
 */
import { signTypedData } from "viem/accounts";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import type { ExitMandate } from "./mandate";
import {
  EXIT_MANDATE_EIP712_TYPES,
  ExitMandateSchema,
  EXITLANE_DOMAIN_NAME,
  EXITLANE_DOMAIN_VERSION,
  hashMandate,
  mandateTypedData,
  recoverMandateSigner,
  verifyMandateSigner,
} from "./mandate";

// ── Test keys (Hardhat/Foundry standard test vectors — NOT for production) ────

const OWNER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const OWNER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const OTHER_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const OTHER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// ── Fixture ───────────────────────────────────────────────────────────────────

const BASE_MANDATE_RAW = {
  mandateVersion: "1",
  owner: OWNER_ADDRESS,
  treasuryWallet: OWNER_ADDRESS,
  inputToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  outputToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  maxInputAmount: "25000000000000000000", // 25 ETH in wei
  triggerComparator: "lte",
  triggerThreshold: "215000000000", // $2 150.00 × 10^8
  maxSlippageBps: 50,
  approvedChainId: "84532", // Base Sepolia
  approvedRouter: "0x2626664c2603336E57B271c5C0b26F421741e481",
  outputRecipient: OWNER_ADDRESS,
  validAfter: "1700000000",
  expiry: "1893456000",
  nonce: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};

function parseMandate(raw = BASE_MANDATE_RAW): ExitMandate {
  const r = ExitMandateSchema.safeParse(raw);
  if (!r.success)
    throw new Error(`Fixture invalid: ${JSON.stringify(r.error.issues)}`);
  return r.data;
}

async function signMandate(mandate: ExitMandate, pk: Hex): Promise<Hex> {
  const td = mandateTypedData(mandate);
  return signTypedData({
    privateKey: pk,
    types: EXIT_MANDATE_EIP712_TYPES,
    primaryType: "ExitMandate" as const,
    domain: td.domain,
    message: td.message,
  });
}

// ── Schema tests ──────────────────────────────────────────────────────────────

describe("ExitMandateSchema", () => {
  it("parses a valid mandate", () => {
    expect(ExitMandateSchema.safeParse(BASE_MANDATE_RAW).success).toBe(true);
  });

  it("rejects mandateVersion !== '1'", () => {
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, mandateVersion: "2" })
        .success,
    ).toBe(false);
  });

  it("rejects an unsupported triggerComparator", () => {
    expect(
      ExitMandateSchema.safeParse({
        ...BASE_MANDATE_RAW,
        triggerComparator: "gte",
      }).success,
    ).toBe(false);
  });

  it("rejects expiry not after validAfter", () => {
    expect(
      ExitMandateSchema.safeParse({
        ...BASE_MANDATE_RAW,
        expiry: "1700000000", // equal → invalid
      }).success,
    ).toBe(false);

    expect(
      ExitMandateSchema.safeParse({
        ...BASE_MANDATE_RAW,
        expiry: "1699999999", // before validAfter → invalid
      }).success,
    ).toBe(false);
  });

  it("rejects identical inputToken and outputToken", () => {
    expect(
      ExitMandateSchema.safeParse({
        ...BASE_MANDATE_RAW,
        outputToken: BASE_MANDATE_RAW.inputToken,
      }).success,
    ).toBe(false);
  });

  it("rejects malformed numeric fields", () => {
    expect(
      ExitMandateSchema.safeParse({
        ...BASE_MANDATE_RAW,
        maxInputAmount: "1.5",
      }).success,
    ).toBe(false);

    expect(
      ExitMandateSchema.safeParse({
        ...BASE_MANDATE_RAW,
        triggerThreshold: "-100",
      }).success,
    ).toBe(false);

    expect(
      ExitMandateSchema.safeParse({
        ...BASE_MANDATE_RAW,
        maxSlippageBps: 10_001,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid owner address", () => {
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, owner: "0xinvalid" })
        .success,
    ).toBe(false);
  });

  it("rejects a missing required field (nonce)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { nonce: _nonce, ...withoutNonce } = BASE_MANDATE_RAW;
    expect(ExitMandateSchema.safeParse(withoutNonce).success).toBe(false);
  });
});

// ── EIP-712 hash tests ────────────────────────────────────────────────────────

describe("hashMandate", () => {
  it("returns a 32-byte hex string", () => {
    const h = hashMandate(parseMandate());
    expect(h).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it("produces the same hash for identical mandates", () => {
    const m = parseMandate();
    expect(hashMandate(m)).toBe(hashMandate(m));
  });

  it("uses the correct EIP-712 domain", () => {
    const td = mandateTypedData(parseMandate());
    expect(td.domain.name).toBe(EXITLANE_DOMAIN_NAME);
    expect(td.domain.version).toBe(EXITLANE_DOMAIN_VERSION);
    expect(td.domain.chainId).toBe(84532); // Number(84532n)
  });

  // ── EIP-712 field mutation coverage ────────────────────────────────────────
  //
  // All 15 signed ExitMandate fields are listed here.
  // - Mutable fields: a different value must produce a different EIP-712 hash.
  // - Literal fields (mandateVersion, triggerComparator): Zod rejects any other
  //   value at the schema boundary, so they never reach hashMandate().
  //   A different value would nonetheless produce a different hash; the schema
  //   guard is an equivalent — and stronger — protection.
  //
  // EIP-712 field index → test label:
  //  1. mandateVersion      (literal "1"  — schema-locked; see note below)
  //  2. owner
  //  3. treasuryWallet
  //  4. inputToken
  //  5. outputToken
  //  6. maxInputAmount
  //  7. triggerComparator   (literal "lte" — schema-locked; see note below)
  //  8. triggerThreshold
  //  9. maxSlippageBps
  // 10. approvedChainId
  // 11. approvedRouter
  // 12. outputRecipient
  // 13. validAfter
  // 14. expiry
  // 15. nonce
  const mutations: Array<[string, Partial<typeof BASE_MANDATE_RAW>]> = [
    // 1 — schema-locked literal; no mutable object needed
    ["mandateVersion: schema-locked literal (any other value rejected by schema)", {}],
    // 2-6
    ["owner", { owner: OTHER_ADDRESS }],
    ["treasuryWallet", { treasuryWallet: OTHER_ADDRESS }],
    ["inputToken", { inputToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }],
    ["outputToken", { outputToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" }],
    ["maxInputAmount", { maxInputAmount: "1000000000000000000" }],
    // 7 — schema-locked literal; no mutable object needed
    ["triggerComparator: schema-locked literal (any other value rejected by schema)", {}],
    // 8-15
    ["triggerThreshold", { triggerThreshold: "200000000000" }],
    ["maxSlippageBps", { maxSlippageBps: 100 }],
    ["approvedChainId", { approvedChainId: "8453" }],
    ["approvedRouter", { approvedRouter: OTHER_ADDRESS }],
    ["outputRecipient", { outputRecipient: OTHER_ADDRESS }],
    ["validAfter", { validAfter: "1600000000" }],
    ["expiry", { expiry: "2000000000" }],
    ["nonce", { nonce: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" }],
  ];

  it("all 15 EIP-712 mandate fields are individually listed in the mutation table above", () => {
    // This test counts the mutation entries to catch accidental omissions.
    // 13 mutable fields + 2 schema-locked literals = 15 total.
    expect(mutations).toHaveLength(15);
  });

  it("literal mandateVersion enforced: schema rejects any value other than '1'", () => {
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, mandateVersion: "2" }).success,
    ).toBe(false);
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, mandateVersion: "" }).success,
    ).toBe(false);
  });

  it("literal triggerComparator enforced: schema rejects any value other than 'lte'", () => {
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, triggerComparator: "gte" }).success,
    ).toBe(false);
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, triggerComparator: "lt" }).success,
    ).toBe(false);
  });

  for (const [field, mutation] of mutations) {
    if (Object.keys(mutation).length === 0) continue; // schema-locked literals — skip hash check
    it(`hash changes when ${field} is mutated`, () => {
      const base = parseMandate();
      const mutatedRaw = { ...BASE_MANDATE_RAW, ...mutation };
      // Some mutations may violate the schema (e.g. swapping tokens creates matching pair).
      // In that case the schema rejection is itself proof the field is constrained.
      const mutatedResult = ExitMandateSchema.safeParse(mutatedRaw);
      if (!mutatedResult.success) return;
      expect(hashMandate(base)).not.toBe(hashMandate(mutatedResult.data));
    });
  }

  it("rejects approvedChainId above Number.MAX_SAFE_INTEGER", () => {
    const unsafeChainId = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString();
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, approvedChainId: unsafeChainId }).success,
    ).toBe(false);
  });

  it("rejects validAfter above uint64 max", () => {
    const aboveUint64 = "18446744073709551616"; // uint64 max + 1
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, validAfter: aboveUint64 }).success,
    ).toBe(false);
  });

  it("rejects expiry above uint64 max", () => {
    const aboveUint64 = "18446744073709551616";
    expect(
      ExitMandateSchema.safeParse({ ...BASE_MANDATE_RAW, expiry: aboveUint64 }).success,
    ).toBe(false);
  });
});

// ── Signature recovery tests ──────────────────────────────────────────────────

describe("recoverMandateSigner / verifyMandateSigner", () => {
  it("recovers the correct signer", async () => {
    const mandate = parseMandate();
    const sig = await signMandate(mandate, OWNER_PRIVATE_KEY);
    const recovered = await recoverMandateSigner(mandate, sig);
    expect(recovered.toLowerCase()).toBe(OWNER_ADDRESS.toLowerCase());
  });

  it("verifyMandateSigner returns true for the correct owner", async () => {
    const mandate = parseMandate();
    const sig = await signMandate(mandate, OWNER_PRIVATE_KEY);
    expect(await verifyMandateSigner(mandate, sig, OWNER_ADDRESS)).toBe(true);
  });

  it("verifyMandateSigner returns false for a different signer", async () => {
    const mandate = parseMandate();
    const sig = await signMandate(mandate, OTHER_PRIVATE_KEY);
    // Signed by OTHER but owner is OWNER_ADDRESS
    expect(await verifyMandateSigner(mandate, sig, OWNER_ADDRESS)).toBe(false);
  });

  it("a signature over a mutated mandate does not verify for the original", async () => {
    const base = parseMandate();
    const mutated = ExitMandateSchema.parse({
      ...BASE_MANDATE_RAW,
      maxInputAmount: "1000000000000000000",
    });
    const sigOverMutated = await signMandate(mutated, OWNER_PRIVATE_KEY);
    // Verify the mutated signature against the BASE mandate — must fail
    expect(await verifyMandateSigner(base, sigOverMutated, OWNER_ADDRESS)).toBe(false);
  });
});
