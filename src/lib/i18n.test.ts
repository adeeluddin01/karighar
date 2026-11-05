import { describe, expect, it } from "vitest";

// The dictionary lives in a "use client" module with a React context, so
// these checks run against its source text rather than importing it: every
// key the app looks up must exist with a non-empty English and Urdu string,
// and no key may be defined twice.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "i18n.tsx"), "utf8");

function dictionary(): Map<string, { en: string; ur: string }> {
  const entries = new Map<string, { en: string; ur: string }>();
  const re = /"([^"]+)":\s*\{\s*en:\s*"((?:[^"\\]|\\.)*)",\s*ur:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  for (const m of SRC.matchAll(re)) {
    expect(entries.has(m[1]), `duplicate i18n key: ${m[1]}`).toBe(false);
    entries.set(m[1], { en: m[2], ur: m[3] });
  }
  return entries;
}

describe("i18n dictionary", () => {
  it("has a non-empty English and Urdu string for every key", () => {
    const dict = dictionary();
    expect(dict.size).toBeGreaterThan(50);
    for (const [key, entry] of dict) {
      expect(entry.en.trim().length, `${key} needs English`).toBeGreaterThan(0);
      expect(entry.ur.trim().length, `${key} needs Urdu`).toBeGreaterThan(0);
      expect(entry.ur, `${key} Urdu must not be the English text`).not.toBe(entry.en);
    }
  });

  it("covers every nav label in nav.ts", () => {
    const nav = readFileSync(join(__dirname, "..", "components", "nav.ts"), "utf8");
    // Only the NAV / PHONE_NAV tables — proEntry() labels below them are
    // plain-function strings, not nav labels, and stay English for now.
    const tables = nav.slice(
      nav.indexOf("export const NAV"),
      nav.indexOf("Role landing pages")
    );
    const labels = new Set<string>();
    for (const m of tables.matchAll(/label:\s*"([^"]+)"/g)) labels.add(m[1]);
    const dict = dictionary();
    expect(labels.size).toBeGreaterThan(0);
    for (const label of labels) {
      expect(dict.has(`nav:${label}`), `missing nav translation: ${label}`).toBe(true);
    }
  });

  it("covers every job status", () => {
    const dict = dictionary();
    for (const s of [
      "created",
      "bidding",
      "assigned",
      "en_route",
      "arrived",
      "in_progress",
      "completed",
      "paid",
      "rated",
      "cancelled",
      "disputed",
    ]) {
      expect(dict.has(`status:${s}`), `missing status translation: ${s}`).toBe(true);
    }
  });
});
