import { describe, expect, it } from "vitest";
import { categoryIcon } from "./catalogIcons";

describe("categoryIcon", () => {
  it("maps existing slugs", () => {
    expect(categoryIcon("ac")).toBe("snow");
    expect(categoryIcon("bolt")).toBe("zap");
    expect(categoryIcon("wrench")).toBe("wrench");
    expect(categoryIcon("carpenter")).toBe("hammer");
    expect(categoryIcon("painter")).toBe("brush");
  });

  it("maps the 5 new category slugs", () => {
    expect(categoryIcon("carpenter")).toBe("hammer");
    expect(categoryIcon("painter")).toBe("brush");
    expect(categoryIcon("solar")).toBe("spark");
    expect(categoryIcon("camera")).toBe("camera");
    expect(categoryIcon("washer")).toBe("gear");
  });

  it("is case-insensitive", () => {
    expect(categoryIcon("CARPENTER")).toBe("hammer");
    expect(categoryIcon("Solar")).toBe("spark");
  });

  it("falls back to wrench for unknown or missing slugs", () => {
    expect(categoryIcon("unknown-slug")).toBe("wrench");
    expect(categoryIcon(null)).toBe("wrench");
    expect(categoryIcon(undefined)).toBe("wrench");
    expect(categoryIcon("")).toBe("wrench");
  });
});
