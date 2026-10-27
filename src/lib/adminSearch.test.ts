import { describe, expect, it } from "vitest";
import { matchesQuery, phoneKey } from "./adminSearch";

const ali = { name: "Ali Raza", phone: "+92 300 1234567", email: "ali.raza@gmail.com" };

describe("phoneKey", () => {
  it("reduces the ways one Karachi number gets typed to the same key", () => {
    const keys = ["03001234567", "+923001234567", "0300-1234567", "0300 123 4567"].map(phoneKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("3001234567");
  });

  it("leaves a short fragment alone so partial typing still matches", () => {
    expect(phoneKey("1234")).toBe("1234");
  });

  it("survives null and empty input", () => {
    expect(phoneKey(null)).toBe("");
    expect(phoneKey(undefined)).toBe("");
  });
});

describe("matchesQuery", () => {
  it("shows everything when nothing is typed", () => {
    expect(matchesQuery("", ali)).toBe(true);
    expect(matchesQuery("   ", ali)).toBe(true);
  });

  it("finds by name, case-insensitively and mid-word", () => {
    expect(matchesQuery("ali", ali)).toBe(true);
    expect(matchesQuery("RAZA", ali)).toBe(true);
    expect(matchesQuery("Bilal", ali)).toBe(false);
  });

  it("finds by email, whole or partial", () => {
    expect(matchesQuery("ali.raza@gmail.com", ali)).toBe(true);
    expect(matchesQuery("@gmail", ali)).toBe(true);
    expect(matchesQuery("@hotmail", ali)).toBe(false);
  });

  // The point of phoneKey: support quotes the number in whatever format the
  // customer used, which is rarely the format it was stored in.
  it("finds by phone however either side formatted it", () => {
    for (const q of ["03001234567", "+923001234567", "0300-1234567", "300 1234567"]) {
      expect(matchesQuery(q, ali), q).toBe(true);
    }
  });

  it("does not match a different number that shares a prefix", () => {
    expect(matchesQuery("03009999999", ali)).toBe(false);
  });

  it("handles records with missing fields", () => {
    expect(matchesQuery("ali", { name: null, phone: null, email: null })).toBe(false);
    expect(matchesQuery("", { name: null, phone: null, email: null })).toBe(true);
  });

  it("still treats an alphanumeric query as text, not a phone number", () => {
    expect(matchesQuery("raza2", ali)).toBe(false);
    expect(matchesQuery("ali.raza", ali)).toBe(true);
  });
});
