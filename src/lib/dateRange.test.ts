import { describe, expect, it } from "vitest";
import {
  RANGE_PRESETS,
  customRange,
  describeRange,
  inRange,
  resolveRange,
} from "./dateRange";

// A fixed local "now": 15 Nov 2026, mid-afternoon.
const NOW = new Date(2026, 10, 15, 15, 30);
const local = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h).toISOString();

describe("resolveRange", () => {
  it("has no bounds for all time", () => {
    expect(resolveRange("all", NOW)).toEqual({ from: null, to: null });
  });

  it("starts this month on the 1st at local midnight", () => {
    expect(resolveRange("thisMonth", NOW).from).toBe(local(2026, 10, 1));
  });

  // 29 days back plus today = 30 days of rows. Going back a full 30 would
  // include 31 days, which is not what the label promises.
  it("covers exactly 30 days for last30", () => {
    expect(resolveRange("last30", NOW).from).toBe(local(2026, 9, 17));
  });

  it("covers 90 days for last90", () => {
    expect(resolveRange("last90", NOW).from).toBe(local(2026, 7, 18));
  });

  it("starts this year on 1 January", () => {
    expect(resolveRange("thisYear", NOW).from).toBe(local(2026, 0, 1));
  });

  it("leaves the upper bound open on every preset", () => {
    for (const { key } of RANGE_PRESETS) {
      expect(resolveRange(key, NOW).to).toBeNull();
    }
  });

  // Month and year boundaries are where naive date maths goes wrong.
  it("handles a start-of-month now without landing in the future", () => {
    const firstOfMarch = new Date(2026, 2, 1, 9);
    // 29 days back from 1 Mar crosses a 28-day February and lands on 31 Jan.
    expect(resolveRange("last30", firstOfMarch).from).toBe(local(2026, 0, 31));
    expect(resolveRange("thisMonth", firstOfMarch).from).toBe(local(2026, 2, 1));
  });

  // The same arithmetic one day longer, which is the whole point of letting
  // Date do it rather than subtracting 30 * 86400000.
  it("handles a leap year", () => {
    const leap = new Date(2028, 2, 1, 9); // 1 Mar 2028, after 29 Feb
    expect(resolveRange("last30", leap).from).toBe(local(2028, 1, 1));
  });
});

describe("customRange", () => {
  it("includes the whole of the end day", () => {
    const r = customRange("2026-11-01", "2026-11-30");
    expect(r.from).toBe(local(2026, 10, 1));
    // Exclusive bound is the START of 1 Dec, so 30 Nov 23:59 is still in.
    expect(r.to).toBe(local(2026, 11, 1));
    expect(inRange(local(2026, 10, 30, 23), r)).toBe(true);
    expect(inRange(local(2026, 11, 1, 0), r)).toBe(false);
  });

  it("allows an open end", () => {
    expect(customRange("2026-11-01", "")).toEqual({ from: local(2026, 10, 1), to: null });
    expect(customRange("", "2026-11-30").from).toBeNull();
  });

  // Half-typed input is normal while someone is still using the picker.
  it("treats malformed input as no bound rather than throwing", () => {
    expect(customRange("2026-1", "nonsense")).toEqual({ from: null, to: null });
    expect(customRange("", "")).toEqual({ from: null, to: null });
  });
});

describe("inRange", () => {
  const r = customRange("2026-11-01", "2026-11-30");

  it("includes both ends of the window", () => {
    expect(inRange(local(2026, 10, 1, 0), r)).toBe(true);
    expect(inRange(local(2026, 10, 15), r)).toBe(true);
  });

  it("excludes outside it", () => {
    expect(inRange(local(2026, 9, 31, 23), r)).toBe(false);
    expect(inRange(local(2026, 11, 2), r)).toBe(false);
  });

  it("is open where a bound is null", () => {
    expect(inRange(local(1999, 0, 1), { from: null, to: null })).toBe(true);
  });

  it("rejects an unparseable timestamp instead of letting it through", () => {
    expect(inRange("", r)).toBe(false);
    expect(inRange("not a date", r)).toBe(false);
  });
});

describe("describeRange", () => {
  it("names all time", () => {
    expect(describeRange({ from: null, to: null }, NOW)).toBe("All time");
  });

  // The exclusive upper bound must not be shown as the last day, or a
  // November statement would read as ending on 1 December.
  it("names the last included day, not the exclusive bound", () => {
    expect(describeRange(customRange("2026-11-01", "2026-11-30"), NOW)).toBe(
      "1 Nov 2026 – 30 Nov 2026"
    );
  });

  it("runs an open end up to today", () => {
    expect(describeRange(resolveRange("thisMonth", NOW), NOW)).toBe("1 Nov 2026 – 15 Nov 2026");
  });
});
