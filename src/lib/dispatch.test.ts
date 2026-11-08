import { describe, expect, it } from "vitest";
import {
  DISPATCH_LADDER_KM,
  DISPATCH_MAX_KM,
  DISPATCH_START_KM,
  DISPATCH_STEP_MINUTES,
  dispatchNote,
  dispatchRadiusForAge,
  dispatchRadiusKm,
  kmBetween,
  minutesUntilNextRing,
} from "./dispatch";

const AT = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

describe("the ladder", () => {
  // The spec, in one assertion: every rung odd, starting at 3, ending at 15.
  it("is odd all the way up", () => {
    expect(DISPATCH_LADDER_KM).toEqual([3, 5, 7, 9, 11, 13, 15]);
    for (const km of DISPATCH_LADDER_KM) expect(km % 2).toBe(1);
    expect(DISPATCH_START_KM).toBe(3);
    expect(DISPATCH_MAX_KM).toBe(15);
  });

  // These exact pairs are also asserted by the verification query at the
  // bottom of patch_v29_radius_dispatch.sql. If one side changes, the
  // database and the UI start telling the pro different things.
  it("matches dispatch_radius_for_age() in patch_v29", () => {
    const expected: [number, number | null][] = [
      [0, 3],
      [9, 3],
      [10, 5],
      [19, 5],
      [20, 7],
      [29, 7],
      [30, 9],
      [39, 9],
      [40, 11],
      [50, 13],
      [59, 13],
      [60, 15],
      [69, 15],
      [70, null],
      [600, null],
    ];
    for (const [mins, km] of expected) {
      expect([mins, dispatchRadiusForAge(mins)]).toEqual([mins, km]);
    }
  });

  it("widens exactly on the step boundary, not a minute early", () => {
    expect(dispatchRadiusForAge(DISPATCH_STEP_MINUTES - 0.01)).toBe(3);
    expect(dispatchRadiusForAge(DISPATCH_STEP_MINUTES)).toBe(5);
  });

  // Clock skew between the browser and Postgres can make a job look as if
  // it was posted in the future. Never show a ring wider than the start.
  it("treats an unknown or negative age as brand new", () => {
    expect(dispatchRadiusForAge(null)).toBe(3);
    expect(dispatchRadiusForAge(undefined)).toBe(3);
    expect(dispatchRadiusForAge(-5)).toBe(3);
    expect(dispatchRadiusForAge(NaN)).toBe(3);
  });
});

describe("dispatchRadiusKm", () => {
  it("reads an age off a timestamp", () => {
    expect(dispatchRadiusKm(AT(0))).toBe(3);
    expect(dispatchRadiusKm(AT(25))).toBe(7);
    expect(dispatchRadiusKm(AT(65))).toBe(15);
    expect(dispatchRadiusKm(AT(120))).toBeNull();
  });

  it("accepts the ISO strings PostgREST actually returns", () => {
    const now = new Date("2026-11-08T12:00:00.000Z");
    expect(dispatchRadiusKm("2026-11-08T11:38:00.000Z", now)).toBe(7);
  });

  it("falls back to the first ring for missing or unparseable input", () => {
    expect(dispatchRadiusKm(null)).toBe(3);
    expect(dispatchRadiusKm("not a date")).toBe(3);
  });
});

describe("minutesUntilNextRing", () => {
  it("counts down to the next rung", () => {
    const now = new Date("2026-11-08T12:00:00.000Z");
    // Posted 4 minutes ago: 6 minutes left at 3km.
    expect(minutesUntilNextRing("2026-11-08T11:56:00.000Z", now)).toBe(6);
    // Posted 12 minutes ago: 8 minutes left at 5km.
    expect(minutesUntilNextRing("2026-11-08T11:48:00.000Z", now)).toBe(8);
  });

  it("is null once the job is open to everyone", () => {
    expect(minutesUntilNextRing(AT(70))).toBeNull();
    expect(minutesUntilNextRing(AT(500))).toBeNull();
  });

  it("never returns a negative wait", () => {
    for (const mins of [0, 9.99, 10, 59.9, 69.9]) {
      const v = minutesUntilNextRing(AT(mins));
      if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("kmBetween", () => {
  // Clifton to Gulshan-e-Iqbal, using the centroids patch_v29 seeds.
  it("gets a real Karachi distance about right", () => {
    const d = kmBetween(24.8138, 67.03, 24.9215, 67.0961);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(11);
    expect(d!).toBeLessThan(16);
  });

  it("is zero for the same point, not NaN", () => {
    // sqrt of a float a hair above 1 is what makes an unclamped asin() blow
    // up here; both this and the SQL clamp for exactly this case.
    const d = kmBetween(24.8607, 67.0011, 24.8607, 67.0011);
    expect(d).toBe(0);
    expect(Number.isNaN(d as number)).toBe(false);
  });

  it("is symmetric", () => {
    const a = kmBetween(24.8, 67.0, 24.95, 67.15);
    const b = kmBetween(24.95, 67.15, 24.8, 67.0);
    expect(a!).toBeCloseTo(b!, 9);
  });

  it("is null when any coordinate is missing", () => {
    expect(kmBetween(null, 67, 24, 67)).toBeNull();
    expect(kmBetween(24, 67, 24, undefined)).toBeNull();
  });

  // One degree of latitude is ~111km everywhere; a cheap absolute check that
  // the formula isn't out by a factor of 2 or in the wrong unit.
  it("puts one degree of latitude at about 111km", () => {
    const d = kmBetween(24, 67, 25, 67);
    expect(d!).toBeGreaterThan(110);
    expect(d!).toBeLessThan(112);
  });
});

describe("dispatchNote", () => {
  it("names the ring and when it widens", () => {
    const now = new Date("2026-11-08T12:00:00.000Z");
    expect(dispatchNote("2026-11-08T11:56:00.000Z", now)).toBe(
      "Offered to pros within 3km — widens to 5km in 6 min."
    );
  });

  it("says nothing once the job is open to everyone", () => {
    expect(dispatchNote(AT(90))).toBeNull();
  });

  it("always produces a non-empty sentence while a ring applies", () => {
    for (const mins of [0, 5, 15, 35, 65]) {
      const note = dispatchNote(AT(mins));
      expect(note).toBeTruthy();
      expect(note!.length).toBeGreaterThan(10);
    }
  });
});
