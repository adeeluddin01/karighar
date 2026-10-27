import { describe, it, expect } from "vitest";
import {
  DEFAULT_COMMISSION,
  effectiveRate,
  fromPercent,
  ratePairOf,
  toPercent,
  validatePercent,
  type PlatformSettings,
} from "./commission";

/* The factor-of-100 bug is the only way this feature loses real money: a
   rate typed as "20" and stored unconverted charges 2000%. These pin both
   directions and the round trip. */
describe("percent <-> fraction", () => {
  it("renders the shipped defaults the way an admin reads them", () => {
    expect(toPercent(DEFAULT_COMMISSION.provider.fixed)).toBe("20");
    expect(toPercent(DEFAULT_COMMISSION.provider.custom)).toBe("15");
    expect(toPercent(DEFAULT_COMMISSION.business.fixed)).toBe("20");
    expect(toPercent(DEFAULT_COMMISSION.business.custom)).toBe("15");
  });

  it("parses a typed percentage into the fraction the column stores", () => {
    expect(fromPercent("20")).toBe(0.2);
    expect(fromPercent("15")).toBe(0.15);
    expect(fromPercent("7.5")).toBe(0.075);
    expect(fromPercent("0")).toBe(0);
    expect(fromPercent("100")).toBe(1);
  });

  it("round-trips every rate numeric(4,3) can hold", () => {
    for (let thousandths = 0; thousandths <= 1000; thousandths += 1) {
      const rate = thousandths / 1000;
      expect(fromPercent(toPercent(rate)), `${rate}`).toBe(rate);
    }
  });

  it("tolerates a typed % sign and surrounding space", () => {
    expect(fromPercent(" 20% ")).toBe(0.2);
  });

  // Empty is how an admin CLEARS a per-account override, so it must read as
  // null rather than as 0 — those mean "use the default" and "charge nothing".
  it("treats empty as cleared, not as zero", () => {
    expect(fromPercent("")).toBeNull();
    expect(fromPercent("   ")).toBeNull();
    expect(fromPercent("0")).toBe(0);
  });

  it("refuses nonsense and out-of-range values", () => {
    expect(fromPercent("abc")).toBeNull();
    expect(fromPercent("-5")).toBeNull();
    expect(fromPercent("150")).toBeNull();
  });

  it("renders nothing for a missing rate", () => {
    expect(toPercent(null)).toBe("");
    expect(toPercent(undefined)).toBe("");
  });
});

describe("validatePercent", () => {
  it("accepts a blank optional field and rejects a blank required one", () => {
    expect(validatePercent("")).toBeNull();
    expect(validatePercent("", { required: true })).toMatch(/Enter a commission/);
  });

  it("explains both failure modes", () => {
    expect(validatePercent("abc")).toMatch(/isn't a number/);
    expect(validatePercent("101")).toMatch(/between 0 and 100/);
    expect(validatePercent("-1")).toMatch(/between 0 and 100/);
  });

  it("accepts the endpoints", () => {
    expect(validatePercent("0")).toBeNull();
    expect(validatePercent("100")).toBeNull();
  });
});

/* Mirrors resolve_commission_rate() in patch_v24: null override = follow the
   platform, and only a set override counts as the account's own deal. */
describe("effectiveRate", () => {
  it("follows the platform default when nothing is set", () => {
    expect(effectiveRate(null, 0.2)).toEqual({ rate: 0.2, custom: false });
    expect(effectiveRate(undefined, 0.15)).toEqual({ rate: 0.15, custom: false });
  });

  it("uses the override when there is one", () => {
    expect(effectiveRate(0.1, 0.2)).toEqual({ rate: 0.1, custom: true });
  });

  // 0% is a real deal an admin can strike, and must not be mistaken for
  // "unset" — the column is nullable precisely so the two stay apart.
  it("treats a zero override as a deliberate deal, not as unset", () => {
    expect(effectiveRate(0, 0.2)).toEqual({ rate: 0, custom: true });
  });

  it("marks an override equal to the default as still being its own deal", () => {
    expect(effectiveRate(0.2, 0.2).custom).toBe(true);
  });
});

/* The two tabs read the same row and must not pick up each other's pair —
   that is the whole point of splitting the defaults by account kind. */
describe("ratePairOf", () => {
  const row: PlatformSettings = {
    provider_fixed: 0.2,
    provider_custom: 0.15,
    business_fixed: 0.12,
    business_custom: 0.08,
    updated_at: null,
  };

  it("gives each scope its own pair", () => {
    expect(ratePairOf(row, "provider")).toEqual({ fixed: 0.2, custom: 0.15 });
    expect(ratePairOf(row, "business")).toEqual({ fixed: 0.12, custom: 0.08 });
  });

  // A database that hasn't run patch_v24 returns nothing; the screens must
  // still show the built-in numbers rather than NaN.
  it("falls back to the built-in defaults with no row", () => {
    expect(ratePairOf(null, "provider")).toEqual(DEFAULT_COMMISSION.provider);
    expect(ratePairOf(null, "business")).toEqual(DEFAULT_COMMISSION.business);
  });

  // PostgREST hands numeric(4,3) back as a string often enough to matter;
  // an un-coerced value would reach toPercent and render empty.
  it("coerces values that arrive as strings", () => {
    const stringy = { ...row, business_fixed: "0.125" } as unknown as PlatformSettings;
    expect(ratePairOf(stringy, "business").fixed).toBe(0.125);
  });
});
