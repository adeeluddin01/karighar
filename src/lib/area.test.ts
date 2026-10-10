import { describe, expect, it } from "vitest";
import { areaOf, joinAddress, splitAddress } from "./area";

describe("areaOf", () => {
  it("pulls a known Karachi area out of a stored address", () => {
    expect(areaOf("House 12, Block 7, Gulshan-e-Iqbal, Karachi")).toBe("Gulshan-e-Iqbal");
    expect(areaOf("Flat 3A, DHA, Karachi")).toBe("DHA");
  });

  it("falls back to the part before the city for an unlisted area", () => {
    expect(areaOf("Plot 9, Street 2, Surjani Town, Karachi")).toBe("Surjani Town");
  });

  it("returns null for nothing", () => {
    expect(areaOf(null)).toBeNull();
    expect(areaOf("")).toBeNull();
  });
});

describe("splitAddress / joinAddress", () => {
  it("round-trips without duplicating the area", () => {
    const stored = joinAddress("House 12, Block 7", "Gulshan-e-Iqbal");
    expect(stored).toBe("House 12, Block 7, Gulshan-e-Iqbal, Karachi");

    const { line, area } = splitAddress(stored);
    expect(line).toBe("House 12, Block 7");
    expect(area).toBe("Gulshan-e-Iqbal");
    // Re-saving an untouched prefill must not grow the string.
    expect(joinAddress(line, area!)).toBe(stored);
  });

  it("leaves an area that legitimately appears mid-line alone", () => {
    const { line, area } = splitAddress("Near DHA Phase 6 market, Clifton, Karachi");
    expect(area).toBe("Clifton");
    expect(line).toBe("Near DHA Phase 6 market");
  });

  it("keeps a free-form address in the street line rather than the picker", () => {
    expect(splitAddress("Some place")).toEqual({ line: "Some place", area: null });
    expect(splitAddress(null)).toEqual({ line: "", area: null });
  });
});
