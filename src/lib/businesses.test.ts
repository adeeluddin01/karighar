import { describe, expect, it } from "vitest";
import { businessName, dispatcherOf, groupBusinessTrades } from "./businesses";

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

/* One row per SERVICE comes back from the view, but the map draws one icon
   per TRADE — these pin the collapse down, including the orderings that make
   two businesses in the same trades read the same way. */
describe("groupBusinessTrades", () => {
  const row = (
    business_id: string,
    category_id: string,
    category_name: string,
    category_icon: string | null,
    category_sort: number
  ) => ({ business_id, category_id, category_name, category_icon, category_sort });

  it("collapses many services in one category to a single trade", () => {
    const out = groupBusinessTrades([
      row("b1", "c-ac", "Air conditioning", "ac", 1),
      row("b1", "c-ac", "Air conditioning", "ac", 1),
      row("b1", "c-ac", "Air conditioning", "ac", 1),
    ]);
    expect(out.get("b1")).toEqual([{ id: "c-ac", name: "Air conditioning", icon: "ac" }]);
  });

  it("orders trades by the catalogue's own sort_order, not by arrival", () => {
    const out = groupBusinessTrades([
      row("b1", "c-paint", "Painting", "painter", 9),
      row("b1", "c-ac", "Air conditioning", "ac", 1),
      row("b1", "c-elec", "Electrical", "bolt", 4),
    ]);
    expect(out.get("b1")?.map((t) => t.name)).toEqual([
      "Air conditioning",
      "Electrical",
      "Painting",
    ]);
  });

  it("keeps businesses apart", () => {
    const out = groupBusinessTrades([
      row("b1", "c-ac", "Air conditioning", "ac", 1),
      row("b2", "c-elec", "Electrical", "bolt", 4),
    ]);
    expect(out.get("b1")?.map((t) => t.id)).toEqual(["c-ac"]);
    expect(out.get("b2")?.map((t) => t.id)).toEqual(["c-elec"]);
  });

  // A category row with no icon slug is legal — /admin/catalog has always
  // allowed it — and must not take the whole business off the map.
  it("keeps a trade whose category has no icon", () => {
    const out = groupBusinessTrades([row("b1", "c-odd", "Odd jobs", null, 3)]);
    expect(out.get("b1")).toEqual([{ id: "c-odd", name: "Odd jobs", icon: null }]);
  });

  it("is empty for a business with no services, and for no rows at all", () => {
    expect(groupBusinessTrades([]).size).toBe(0);
    expect(groupBusinessTrades([row("b1", "c-ac", "AC", "ac", 1)]).get("b2")).toBeUndefined();
  });
});
