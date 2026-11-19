import { describe, expect, it } from "vitest";

// The dictionary lives in a "use client" module with a React context, so
// these checks run against its source text rather than importing it: every
// key the app looks up must exist with a non-empty English and Urdu string,
// and no key may be defined twice.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { translateProEntry } from "@/lib/i18n";

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

  it("covers the settings screen", () => {
    const dict = dictionary();
    for (const key of [
      "settings.appearance",
      "settings.themeLight",
      "settings.themeDark",
      "settings.themeSystem",
      "settings.preferences",
      "settings.pushNotif",
      "settings.workWithUs",
      "settings.account",
      "settings.changePassword",
      "settings.logOut",
      "settings.about",
      "settings.helpSupport",
      "settings.terms",
      "settings.privacy",
      "pro.listView",
      "pro.mapView",
    ]) {
      expect(dict.has(key), `missing settings key: ${key}`).toBe(true);
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

describe("translateProEntry", () => {
  it("translates each entry by href, in both languages", () => {
    expect(
      translateProEntry(
        "ur",
        { href: "/pro/dashboard", label: "Pro dashboard", hint: "Your jobs, earnings and commission" },
        "approved"
      )
    ).toEqual({
      href: "/pro/dashboard",
      label: "پرو ڈیش بورڈ",
      hint: "آپ کے کام، آمدنی اور کمیشن",
    });
    expect(
      translateProEntry(
        "ur",
        { href: "/pro/onboarding", label: "Finish pro verification", hint: "Application pending" },
        "pending"
      )?.hint
    ).toBe("درخواست زیرِ غور");
    expect(
      translateProEntry(
        "ur",
        { href: "/pro", label: "Become a pro", hint: "Get matched to jobs near you" },
        null
      )?.label
    ).toBe("پرو بنیں");
    expect(
      translateProEntry(
        "en",
        { href: "/pro/dashboard", label: "Pro dashboard", hint: "Your jobs, earnings and commission" },
        "approved"
      )?.label
    ).toBe("Pro dashboard");
    expect(translateProEntry("ur", null, null)).toBeNull();
    // An entry we don't recognise passes through instead of blanking.
    expect(
      translateProEntry("ur", { href: "/somewhere", label: "Elsewhere", hint: "Unknown" }, null)
    ).toEqual({ href: "/somewhere", label: "Elsewhere", hint: "Unknown" });
  });
});

/* A missing key does not throw — lookup() returns the key itself, so the
   screen renders "book.searchLabel" where a label should be, in BOTH
   languages. That is invisible in review and obvious to a user, which is the
   worst way round. This catches it at build time instead.

   Source text rather than imports, same as the checks above: the screens are
   .tsx and this suite is node-env, so they cannot be mounted. */
describe("every t() key a screen uses actually exists", () => {
  const KEY = /^\s*"([a-zA-Z0-9.:_ -]+)":\s*\{/gm;
  // Excludes a preceding letter or dot, or `.select("x")` and `.get("x")`
  // match their own tails and every column name looks like a missing key.
  //
  // Trailing `[,)]` rather than `)`: t() takes optional placeholder vars,
  // so `t("profile.earnHint", { keep })` is a real call. Requiring the
  // closing paren meant every interpolated key went unchecked — exactly the
  // keys most likely to be mistyped, since they are the newest.
  const CALL = /(?<![A-Za-z_.])t\("([a-zA-Z0-9.:_ -]+)"\s*[,)]/g;

  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) out.push(...tsxFiles(full));
      else if (e.name.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("resolves", () => {
    const defined = new Set([...SRC.matchAll(KEY)].map((m) => m[1]));
    expect(defined.size).toBeGreaterThan(50);

    const missing: string[] = [];
    for (const file of tsxFiles(join(__dirname, ".."))) {
      const body = readFileSync(file, "utf8");
      for (const m of body.matchAll(CALL)) {
        if (!defined.has(m[1])) missing.push(`${m[1]} (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });
});

/* Placeholder substitution. The commission rate is the only thing that uses
   it, and the failure mode it exists to prevent is silent: a dictionary with
   "80-85%" baked in kept quoting that number after an admin moved the
   platform defaults, so the pitch and the deal disagreed with nothing to
   catch it. */
describe("placeholder interpolation", () => {
  it("fills a token in both languages", () => {
    const en = translateProEntry("en", { href: "/pro", label: "x", hint: "y" }, null, {
      keep: "70-75%",
    });
    const ur = translateProEntry("ur", { href: "/pro", label: "x", hint: "y" }, null, {
      keep: "70-75%",
    });
    expect(en?.hint).toContain("70-75%");
    expect(ur?.hint).toContain("70-75%");
    // The token itself must not survive into either rendering.
    expect(en?.hint).not.toContain("{keep}");
    expect(ur?.hint).not.toContain("{keep}");
  });

  it("leaves an unsupplied token visible rather than blanking the copy", () => {
    // "{keep}" on screen is an obvious bug; a gap reads as finished copy and
    // would ship.
    const bare = translateProEntry("en", { href: "/pro", label: "x", hint: "y" }, null);
    expect(bare?.hint).toContain("{keep}");
  });

  it("no dictionary string hardcodes a commission percentage", () => {
    // The whole point: a number here is a number that cannot track the
    // database. Matches "80-85%" and "20%" alike, in either script.
    const offenders = [...SRC.matchAll(/^\s*(en|ur):\s*"([^"]*\d+(?:[–-]\d+)?%[^"]*)"/gm)]
      .map((m) => m[2])
      // Rates are the concern, not every digit: "9am - 9pm" and the like.
      .filter((s) => /%/.test(s));
    expect(offenders).toEqual([]);
  });
});
