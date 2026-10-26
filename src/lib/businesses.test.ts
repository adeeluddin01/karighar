import { describe, expect, it } from "vitest";
import { businessName, dispatcherOf } from "./businesses";

/* The point of these: a Karighar installation with no business accounts —
   which is every one of them today — must behave exactly as it did before
   the feature existed. `dispatcherOf` is the single gate every "dispatched
   by" surface is hung off, so if it holds, none of them can appear. */
describe("dispatcherOf", () => {
  it("is null for an ordinary job, so nothing renders", () => {
    expect(dispatcherOf({ business_id: null })).toBeNull();
  });

  it("is null when the column does not exist yet (pre-patch_v18 database)", () => {
    // PostgREST omits unknown columns entirely rather than returning null.
    expect(dispatcherOf({})).toBeNull();
    expect(dispatcherOf({ business_id: undefined })).toBeNull();
  });

  it("is null for a missing job, so a loading row cannot crash", () => {
    expect(dispatcherOf(null)).toBeNull();
    expect(dispatcherOf(undefined)).toBeNull();
  });

  it("returns the id only when a business actually dispatched the job", () => {
    expect(dispatcherOf({ business_id: "biz-1" })).toBe("biz-1");
  });
});

describe("businessName", () => {
  it("falls back when the name is missing, blank or unreadable", () => {
    expect(businessName(null)).toBe("Service company");
    expect(businessName({ full_name: null })).toBe("Service company");
    expect(businessName({ full_name: "   " })).toBe("Service company");
  });

  it("uses the real name when there is one", () => {
    expect(businessName({ full_name: "Ahmed Cooling Services" })).toBe("Ahmed Cooling Services");
  });
});
