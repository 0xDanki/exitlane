/**
 * Unit tests for domain primitive schemas.
 */
import { describe, expect, it } from "vitest";
import {
  BasisPointsSchema,
  Bytes32Schema,
  EthAddressSchema,
  HexSchema,
  SAFE_CHAIN_ID_MAX,
  SafeChainIdSchema,
  UINT64_MAX,
  Uint256StringSchema,
  Uint64StringSchema,
} from "./primitives";

describe("EthAddressSchema", () => {
  it("accepts a valid lowercase address and checksums it", () => {
    const r = EthAddressSchema.safeParse(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("accepts an already-checksummed address unchanged", () => {
    const addr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const r = EthAddressSchema.safeParse(addr);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(addr);
  });

  it("rejects an address that is too short", () => {
    expect(EthAddressSchema.safeParse("0xf39Fd6e51aad88F6F4ce6aB").success).toBe(
      false,
    );
  });

  it("rejects a non-hex string", () => {
    expect(EthAddressSchema.safeParse("not-an-address").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(EthAddressSchema.safeParse("").success).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(EthAddressSchema.safeParse(12345).success).toBe(false);
  });
});

describe("Bytes32Schema", () => {
  const valid =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  it("accepts a valid 32-byte hex string", () => {
    expect(Bytes32Schema.safeParse(valid).success).toBe(true);
  });

  it("rejects a string that is too short", () => {
    expect(Bytes32Schema.safeParse("0xdeadbeef").success).toBe(false);
  });

  it("rejects a string without 0x prefix", () => {
    const noPrefix = valid.slice(2);
    expect(Bytes32Schema.safeParse(noPrefix).success).toBe(false);
  });

  it("rejects a string that is too long (65 bytes)", () => {
    expect(Bytes32Schema.safeParse(valid + "aa").success).toBe(false);
  });
});

describe("HexSchema", () => {
  it("accepts empty hex (0x)", () => {
    expect(HexSchema.safeParse("0x").success).toBe(true);
  });

  it("accepts a non-empty hex string", () => {
    expect(HexSchema.safeParse("0xdeadbeef").success).toBe(true);
  });

  it("rejects a string without 0x prefix", () => {
    expect(HexSchema.safeParse("deadbeef").success).toBe(false);
  });
});

describe("Uint256StringSchema", () => {
  it("accepts zero", () => {
    const r = Uint256StringSchema.safeParse("0");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(0n);
  });

  it("accepts a large value and returns bigint", () => {
    const r = Uint256StringSchema.safeParse("1000000000000000000");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(1_000_000_000_000_000_000n);
  });

  it("rejects a negative string", () => {
    expect(Uint256StringSchema.safeParse("-1").success).toBe(false);
  });

  it("rejects a decimal string", () => {
    expect(Uint256StringSchema.safeParse("1.5").success).toBe(false);
  });

  it("rejects exponential notation", () => {
    expect(Uint256StringSchema.safeParse("1e18").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(Uint256StringSchema.safeParse("").success).toBe(false);
  });

  it("rejects a non-string number", () => {
    expect(Uint256StringSchema.safeParse(123).success).toBe(false);
  });

  it("rejects a hex string", () => {
    expect(Uint256StringSchema.safeParse("0xff").success).toBe(false);
  });
});

describe("Uint64StringSchema", () => {
  it("exports UINT64_MAX as 18446744073709551615n", () => {
    expect(UINT64_MAX).toBe(18_446_744_073_709_551_615n);
  });

  it("accepts zero", () => {
    const r = Uint64StringSchema.safeParse("0");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(0n);
  });

  it("accepts 1", () => {
    const r = Uint64StringSchema.safeParse("1");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(1n);
  });

  it("accepts a typical Unix timestamp", () => {
    const r = Uint64StringSchema.safeParse("1700000000");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(1_700_000_000n);
  });

  it("accepts the uint64 maximum (18446744073709551615)", () => {
    const r = Uint64StringSchema.safeParse("18446744073709551615");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(18_446_744_073_709_551_615n);
  });

  it("rejects a value one above uint64 max (18446744073709551616)", () => {
    expect(Uint64StringSchema.safeParse("18446744073709551616").success).toBe(false);
  });

  it("rejects a clearly over-large value", () => {
    expect(
      Uint64StringSchema.safeParse(
        "99999999999999999999999999999999999",
      ).success,
    ).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(Uint64StringSchema.safeParse("-1").success).toBe(false);
  });

  it("rejects a decimal / fractional value", () => {
    expect(Uint64StringSchema.safeParse("1.5").success).toBe(false);
  });

  it("rejects exponential notation", () => {
    expect(Uint64StringSchema.safeParse("1e18").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(Uint64StringSchema.safeParse("").success).toBe(false);
  });

  it("rejects a non-numeric string", () => {
    expect(Uint64StringSchema.safeParse("abc").success).toBe(false);
  });

  it("rejects a non-string input", () => {
    expect(Uint64StringSchema.safeParse(123).success).toBe(false);
  });
});

describe("SafeChainIdSchema", () => {
  it("exports SAFE_CHAIN_ID_MAX equal to Number.MAX_SAFE_INTEGER", () => {
    expect(SAFE_CHAIN_ID_MAX).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    expect(SAFE_CHAIN_ID_MAX).toBe(9_007_199_254_740_991n);
  });

  it("accepts Base mainnet chain ID 8453", () => {
    const r = SafeChainIdSchema.safeParse("8453");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(8453n);
  });

  it("accepts Base Sepolia chain ID 84532", () => {
    const r = SafeChainIdSchema.safeParse("84532");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(84532n);
  });

  it("accepts Number.MAX_SAFE_INTEGER (boundary)", () => {
    const r = SafeChainIdSchema.safeParse(Number.MAX_SAFE_INTEGER.toString());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(9_007_199_254_740_991n);
  });

  it("rejects Number.MAX_SAFE_INTEGER + 1 (one above safe boundary)", () => {
    const onePastSafe = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString();
    expect(SafeChainIdSchema.safeParse(onePastSafe).success).toBe(false);
  });

  it("rejects an arbitrary large uint256 chain ID", () => {
    expect(
      SafeChainIdSchema.safeParse(
        "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      ).success,
    ).toBe(false);
  });

  it("rejects zero (chain ID cannot be 0)", () => {
    expect(SafeChainIdSchema.safeParse("0").success).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(SafeChainIdSchema.safeParse("-1").success).toBe(false);
  });

  it("rejects a decimal value", () => {
    expect(SafeChainIdSchema.safeParse("8453.5").success).toBe(false);
  });

  it("rejects a non-string input", () => {
    expect(SafeChainIdSchema.safeParse(84532).success).toBe(false);
  });
});

describe("BasisPointsSchema", () => {
  it("accepts 0", () => {
    expect(BasisPointsSchema.safeParse(0).success).toBe(true);
  });

  it("accepts 10000 (100%)", () => {
    expect(BasisPointsSchema.safeParse(10_000).success).toBe(true);
  });

  it("accepts 50 (0.5%)", () => {
    expect(BasisPointsSchema.safeParse(50).success).toBe(true);
  });

  it("rejects 10001", () => {
    expect(BasisPointsSchema.safeParse(10_001).success).toBe(false);
  });

  it("rejects -1", () => {
    expect(BasisPointsSchema.safeParse(-1).success).toBe(false);
  });

  it("rejects a fractional value", () => {
    expect(BasisPointsSchema.safeParse(0.5).success).toBe(false);
  });
});
