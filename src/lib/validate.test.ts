import { describe, it, expect } from "vitest";
import {
  LIMITS,
  MAX_AMOUNT_PKR,
  PASSWORD_MIN,
  firstError,
  formatCnic,
  isNonEmpty,
  isValidCnic,
  isValidPkPhone,
  normalizePkPhone,
  scheduledAtIso,
  validateAmount,
  validateCnic,
  validateEmail,
  validateFreeText,
  validateName,
  validatePassword,
  validatePhone,
} from "./validate";

describe("normalizePkPhone", () => {
  it("normalizes common local formats to +92", () => {
    expect(normalizePkPhone("03001234567")).toBe("+923001234567");
    expect(normalizePkPhone("0300 123 4567")).toBe("+923001234567");
    expect(normalizePkPhone("0300-1234567")).toBe("+923001234567");
    expect(normalizePkPhone("3001234567")).toBe("+923001234567");
    expect(normalizePkPhone("+923001234567")).toBe("+923001234567");
    expect(normalizePkPhone("00923001234567")).toBe("+923001234567");
  });
  it("rejects invalid numbers", () => {
    expect(normalizePkPhone("12345")).toBeNull();
    expect(normalizePkPhone("0211234567")).toBeNull(); // landline, not 3XX mobile
    expect(normalizePkPhone("")).toBeNull();
    expect(isValidPkPhone("03001234567")).toBe(true);
    expect(isValidPkPhone("nope")).toBe(false);
  });
});

describe("CNIC", () => {
  it("validates 13-digit CNICs", () => {
    expect(isValidCnic("42101-1234567-1")).toBe(true);
    expect(isValidCnic("4210112345671")).toBe(true);
    expect(isValidCnic("42101-123")).toBe(false);
  });
  it("formats progressively", () => {
    expect(formatCnic("42101")).toBe("42101");
    expect(formatCnic("421011234567")).toBe("42101-1234567");
    expect(formatCnic("4210112345671")).toBe("42101-1234567-1");
    expect(formatCnic("42101123456719999")).toBe("42101-1234567-1"); // truncates
  });
});

describe("validateFreeText", () => {
  const opts = { max: 10, label: "note" };

  it("accepts text inside the bounds", () => {
    expect(validateFreeText("hello", opts)).toBeNull();
    expect(validateFreeText("a".repeat(10), opts)).toBeNull();
  });

  // The boundary is where an off-by-one would hide.
  it("rejects one character over the cap", () => {
    expect(validateFreeText("a".repeat(11), opts)).toContain("too long");
  });

  it("measures after trimming, so padding cannot push it over", () => {
    expect(validateFreeText("  " + "a".repeat(10) + "  ", opts)).toBeNull();
  });

  it("treats blank as absent, not as too short, unless a minimum is set", () => {
    expect(validateFreeText("", opts)).toBeNull();
    expect(validateFreeText("   ", opts)).toBeNull();
    expect(validateFreeText("   ", { ...opts, min: 3 })).toBe("Enter note.");
  });

  it("rejects text under the minimum", () => {
    expect(validateFreeText("ab", { ...opts, min: 3 })).toContain("at least 3");
  });
});

describe("validateName", () => {
  it("accepts a normal name", () => {
    expect(validateName("Ahmed Khan")).toBeNull();
    expect(validateName("a".repeat(LIMITS.fullName))).toBeNull();
  });

  it("rejects blank, one character, and over the cap", () => {
    expect(validateName("")).toBe("Enter your full name.");
    expect(validateName("   ")).toBe("Enter your full name.");
    expect(validateName("A")).toBe("Enter your full name.");
    expect(validateName("a".repeat(LIMITS.fullName + 1))).toContain("too long");
  });
});

describe("validatePhone", () => {
  it("accepts the formats normalizePkPhone accepts", () => {
    expect(validatePhone("03001234567")).toBeNull();
    expect(validatePhone("+92 300 1234567")).toBeNull();
  });

  it("explains what is wrong rather than returning a bare boolean", () => {
    expect(validatePhone("")).toBe("Enter your mobile number.");
    expect(validatePhone("0211234567")).toContain("valid Pakistani mobile");
  });
});

describe("validatePassword", () => {
  it("accepts a password at the minimum length", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN))).toBeNull();
  });

  // This is the check that `minLength={6}` could not make: an attribute is
  // only honoured by a real form submit.
  it("rejects one character under the minimum", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN - 1))).toContain("at least");
    expect(validatePassword("")).toBe("Choose a password.");
  });

  it("does not trim — a space is a legitimate password character", () => {
    expect(validatePassword("   a  ")).toBeNull();
  });
});

describe("validateEmail", () => {
  it("accepts an ordinary address", () => {
    expect(validateEmail("you@email.com")).toBeNull();
    expect(validateEmail("a.b+tag@sub.example.co.uk")).toBeNull();
  });

  it("catches the typos worth catching", () => {
    expect(validateEmail("")).toBe("Enter your email address.");
    expect(validateEmail("notanemail")).toContain("email address");
    expect(validateEmail("no@domain")).toContain("email address");
    expect(validateEmail("two@@at.com")).toContain("email address");
  });
});

describe("validateCnic", () => {
  it("accepts 13 digits, formatted or not", () => {
    expect(validateCnic("42101-1234567-1")).toBeNull();
    expect(validateCnic("4210112345671")).toBeNull();
  });

  it("rejects blank and wrong-length", () => {
    expect(validateCnic("")).toBe("Enter your CNIC number.");
    expect(validateCnic("42101-123")).toContain("13-digit");
  });
});

describe("validateAmount", () => {
  it("accepts a sensible figure", () => {
    expect(validateAmount("500")).toBeNull();
    expect(validateAmount("1")).toBeNull();
    expect(validateAmount(String(MAX_AMOUNT_PKR))).toBeNull();
  });

  // The old inline check was `if (!amount) return` — "", "0" and "abc" were
  // indistinguishable and the button silently did nothing.
  it("distinguishes blank, non-numeric and zero", () => {
    expect(validateAmount("")).toBe("Enter an amount.");
    expect(validateAmount("abc")).toBe("That isn't a number.");
    expect(validateAmount("0")).toContain("at least");
    expect(validateAmount("-5")).toContain("at least");
  });

  it("has an upper bound, so numeric(10,2) cannot be overflowed", () => {
    expect(validateAmount(String(MAX_AMOUNT_PKR + 1))).toContain("can't be more than");
  });

  it("takes a custom range and label", () => {
    expect(validateAmount("5", { min: 10, label: "tip" })).toContain("tip");
    expect(validateAmount("5", { min: 1, max: 4 })).toContain("can't be more than");
  });
});

describe("firstError", () => {
  it("returns the first problem, so the user sees the topmost field", () => {
    expect(firstError(null, "second", "third")).toBe("second");
  });

  it("returns null when everything passes", () => {
    expect(firstError(null, null)).toBeNull();
    expect(firstError()).toBeNull();
  });
});

describe("scheduledAtIso", () => {
  it("builds an ISO timestamp from a date and time", () => {
    expect(scheduledAtIso("2026-11-09", "15:00")).toBe(
      new Date("2026-11-09T15:00").toISOString()
    );
  });

  it("returns null when either half is missing", () => {
    expect(scheduledAtIso("", "15:00")).toBeNull();
    expect(scheduledAtIso("2026-11-09", "")).toBeNull();
  });

  // The bug: `new Date("garbage").toISOString()` throws a RangeError rather
  // than returning null, and it was called inside the submit handler — so a
  // draft rehydrated from sessionStorage with a bad date wedged the form
  // with the busy latch still set and no message shown.
  it("returns null instead of throwing on an unparseable pair", () => {
    expect(scheduledAtIso("garbage", "nope")).toBeNull();
    expect(scheduledAtIso("2026-13-45", "99:99")).toBeNull();
  });
});

describe("isNonEmpty", () => {
  it("honours its default minimum of 2", () => {
    expect(isNonEmpty("ab")).toBe(true);
    expect(isNonEmpty("a")).toBe(false);
    expect(isNonEmpty("  a  ")).toBe(false);
    expect(isNonEmpty("")).toBe(false);
  });

  it("takes an explicit minimum", () => {
    expect(isNonEmpty("abc", 3)).toBe(true);
    expect(isNonEmpty("ab", 3)).toBe(false);
  });
});

describe("LIMITS", () => {
  // These numbers are duplicated as CHECK constraints in
  // supabase/patch_v27_input_integrity.sql. If one drifts, a user gets a raw
  // Postgres error where they used to get a sentence. This pins the values
  // so a change here has to be deliberate.
  it("matches the patch_v27 constraints", () => {
    expect(LIMITS.fullName).toBe(80);
    expect(LIMITS.jobTitle).toBe(120);
    expect(LIMITS.jobDescription).toBe(2000);
    expect(LIMITS.addressLine).toBe(200);
    // The stored value is joinAddress(line, area) — the line limit plus the
    // ", <area>, Karachi" suffix has to fit inside this.
    expect(LIMITS.address).toBe(300);
    expect(LIMITS.addressLine + ", Mohammad Ali Society, Karachi".length)
      .toBeLessThanOrEqual(LIMITS.address);
    expect(LIMITS.bio).toBe(1000);
    expect(LIMITS.messageText).toBe(2000);
    expect(LIMITS.disputeReason).toBe(2000);
    expect(LIMITS.bidNote).toBe(300);
  });
});
