import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dbErrorMessage } from "./dbErrors";

// The dev-mode suffix would otherwise appear in every assertion. These tests
// pin production behaviour, which is the behaviour that matters for leakage.
// vi.stubEnv rather than assigning process.env.NODE_ENV directly: TS types it
// readonly, and stubEnv is restored for us.
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dbErrorMessage", () => {
  it("always returns something — a silent failure reads as a dead button", () => {
    expect(dbErrorMessage(null)).toBeTruthy();
    expect(dbErrorMessage(undefined)).toBeTruthy();
    expect(dbErrorMessage({})).toBeTruthy();
  });

  it("maps a named constraint to its own copy", () => {
    const err = {
      code: "23514",
      message:
        'new row for relation "jobs" violates check constraint "jobs_title_len"',
    };
    expect(dbErrorMessage(err)).toBe("That job title is too long. Please shorten it.");
  });

  it("finds the constraint name in details as well as message", () => {
    const err = {
      code: "23514",
      message: "check constraint violated",
      details: 'Failing row violates constraint "messages_text_len"',
    };
    expect(dbErrorMessage(err)).toContain("message is too long");
  });

  it("falls back on SQLSTATE when the constraint is unknown to us", () => {
    expect(
      dbErrorMessage({ code: "23514", message: 'violates check constraint "some_new_thing"' })
    ).toBe("One of those values isn't allowed. Please review and try again.");
    expect(dbErrorMessage({ code: "23505", message: "duplicate key" })).toBe(
      "That has already been recorded."
    );
    expect(dbErrorMessage({ code: "23503", message: "fk" })).toContain("no longer exists");
    expect(dbErrorMessage({ code: "42501", message: "rls" })).toBe(
      "You don't have permission to do that."
    );
  });

  // Our own triggers raise messages written for people — "A job cannot be
  // unassigned", "Only the assigned pro can propose a price". Those are
  // better copy than anything generic.
  it("passes through a trigger's own wording", () => {
    expect(
      dbErrorMessage({ code: "P0001", message: "A job cannot be unassigned" })
    ).toBe("A job cannot be unassigned");
  });

  it("still says something if a trigger raises an empty message", () => {
    expect(dbErrorMessage({ code: "P0001", message: "   " })).toBeTruthy();
  });

  // The behaviour this module exists for.
  it("does not leak table, column or policy names in production", () => {
    const leaky = {
      code: "42501",
      message:
        'new row violates row-level security policy "jobs_update_customer" for table "jobs"',
      details: 'column "commission_rate" of relation "jobs"',
    };
    const shown = dbErrorMessage(leaky);
    expect(shown).not.toContain("jobs");
    expect(shown).not.toContain("row-level security");
    expect(shown).not.toContain("commission_rate");
  });

  it("keeps the raw message in development, where losing it costs debugging time", () => {
    vi.stubEnv("NODE_ENV", "development");
    const shown = dbErrorMessage({ code: "23505", message: "duplicate key value" });
    expect(shown).toContain("already been recorded");
    expect(shown).toContain("duplicate key value");
  });
});

// The copy map is keyed by constraint names that live in SQL, so nothing in
// the type system ties the two together. Same approach as i18n.test.ts:
// assert against the source text. Rename a constraint in the patch without
// renaming it here and the user gets a generic message instead of the
// specific one — a silent regression this makes loud.
describe("constraint copy stays in step with the SQL", () => {
  const PATCH = readFileSync(
    join(__dirname, "..", "..", "supabase", "patch_v27_input_integrity.sql"),
    "utf8"
  );
  const SRC = readFileSync(join(__dirname, "dbErrors.ts"), "utf8");

  const sqlNames = [...PATCH.matchAll(/add constraint ([a-z0-9_]+)/g)].map((m) => m[1]);
  const mapped = new Set([...SRC.matchAll(/^ {2}([a-z0-9_]+):/gm)].map((m) => m[1]));

  it("finds the constraints in the patch", () => {
    // Guards the regex itself: a zero-match would make the next test vacuous.
    expect(sqlNames.length).toBeGreaterThan(10);
  });

  it("has user-facing copy for every constraint the patch adds", () => {
    const missing = sqlNames.filter((n) => !mapped.has(n));
    expect(missing).toEqual([]);
  });

  it("maps each of those constraints to a real sentence", () => {
    for (const name of sqlNames) {
      const shown = dbErrorMessage({
        code: "23514",
        message: `violates check constraint "${name}"`,
      });
      expect(shown.length).toBeGreaterThan(10);
      // Never echo the constraint name back at the user.
      expect(shown).not.toContain(name);
    }
  });
});
