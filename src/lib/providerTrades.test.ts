import { describe, expect, it } from "vitest";
import {
  categoriesOf,
  serviceIdsFor,
  tradesChanged,
  tradesDiff,
  type TradeService,
} from "./providerTrades";

// Two categories, two services each — enough to prove the mapping goes both
// ways without a category ever being implied by a single service.
const SERVICES: TradeService[] = [
  { id: "s1", category_id: "elec" },
  { id: "s2", category_id: "elec" },
  { id: "s3", category_id: "plumb" },
  { id: "s4", category_id: "plumb" },
  { id: "s5", category_id: "ac" },
];

describe("categoriesOf", () => {
  it("maps owned service ids up to their categories", () => {
    expect(categoriesOf(["s1", "s3"], SERVICES).sort()).toEqual(["elec", "plumb"]);
  });

  it("dedupes when several services share a category", () => {
    expect(categoriesOf(["s1", "s2"], SERVICES)).toEqual(["elec"]);
  });

  // A provider_services row outlives the service it points at when the
  // catalog is edited. A stale id must not conjure a chip out of nothing.
  it("ignores service ids that are no longer in the catalog", () => {
    expect(categoriesOf(["s1", "deleted"], SERVICES)).toEqual(["elec"]);
    expect(categoriesOf(["gone"], SERVICES)).toEqual([]);
  });

  it("handles an empty set", () => {
    expect(categoriesOf([], SERVICES)).toEqual([]);
  });
});

describe("serviceIdsFor", () => {
  it("expands categories to every service inside them", () => {
    expect(serviceIdsFor(["elec"], SERVICES).sort()).toEqual(["s1", "s2"]);
    expect(serviceIdsFor(["elec", "ac"], SERVICES).sort()).toEqual(["s1", "s2", "s5"]);
  });

  it("round-trips with categoriesOf", () => {
    const ids = serviceIdsFor(["elec", "plumb"], SERVICES);
    expect(categoriesOf(ids, SERVICES).sort()).toEqual(["elec", "plumb"]);
  });

  it("is empty for no categories or an unknown one", () => {
    expect(serviceIdsFor([], SERVICES)).toEqual([]);
    expect(serviceIdsFor(["nope"], SERVICES)).toEqual([]);
  });
});

describe("tradesDiff", () => {
  it("reports only what actually moved", () => {
    expect(tradesDiff(["s1", "s2"], ["s2", "s3"])).toEqual({
      toAdd: ["s3"],
      toRemove: ["s1"],
    });
  });

  it("adds without removing, and removes without adding", () => {
    expect(tradesDiff(["s1"], ["s1", "s2"])).toEqual({ toAdd: ["s2"], toRemove: [] });
    expect(tradesDiff(["s1", "s2"], ["s1"])).toEqual({ toAdd: [], toRemove: ["s2"] });
  });

  // The case that makes the save skippable: both lists empty means neither
  // round trip is issued at all.
  it("is empty on both sides when nothing changed", () => {
    expect(tradesDiff(["s1", "s2"], ["s2", "s1"])).toEqual({ toAdd: [], toRemove: [] });
  });

  it("tolerates duplicates in either input", () => {
    expect(tradesDiff(["s1", "s1"], ["s1"])).toEqual({ toAdd: [], toRemove: [] });
    expect(tradesDiff([], ["s1", "s1"])).toEqual({ toAdd: ["s1"], toRemove: [] });
  });

  // Why the save applies toAdd first: an interrupted save must leave a
  // SUPERSET of the trades, never a subset. A pro listed under one trade too
  // many is a retry away from correct; a pro listed under none has silently
  // dropped out of the open pool and nobody finds out.
  it("never requires a removal before an addition", () => {
    const { toAdd, toRemove } = tradesDiff(["s1"], ["s2"]);
    const afterAddOnly = new Set(["s1", ...toAdd]);
    expect(afterAddOnly.has("s1")).toBe(true);
    expect(afterAddOnly.has("s2")).toBe(true);
    expect(toRemove).toEqual(["s1"]);
  });
});

describe("tradesChanged", () => {
  it("ignores order and duplicates", () => {
    expect(tradesChanged(["a", "b"], ["b", "a"])).toBe(false);
    expect(tradesChanged(["a", "a", "b"], ["b", "a"])).toBe(false);
  });

  it("spots an addition, a removal and a swap", () => {
    expect(tradesChanged(["a"], ["a", "b"])).toBe(true);
    expect(tradesChanged(["a", "b"], ["a"])).toBe(true);
    expect(tradesChanged(["a"], ["b"])).toBe(true);
  });

  it("treats two empty sets as unchanged", () => {
    expect(tradesChanged([], [])).toBe(false);
  });
});
