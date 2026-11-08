/* ============================================================
   The widening dispatch ring.

   A new job is offered first to technicians within 3km of it, and the ring
   widens every 10 minutes while it goes unclaimed:

       0-9 min   3 km        40-49 min  11 km
       10-19     5 km        50-59      13 km
       20-29     7 km        60-69      15 km
       30-39     9 km        70+        everyone

   All odd, capped at 15km — roughly the width of Karachi's built-up core,
   past which holding a job back helps nobody.

   NOTHING HERE ENFORCES ANYTHING. This app is a static export; the anon key
   ships in the bundle, so a hand-written supabase-js call bypasses every
   line of this file. The ring is enforced by RLS — `jobs_select`,
   `jobs_claim` and `bids_insert` in
   supabase/patch_v29_radius_dispatch.sql all call
   caller_in_dispatch_range(). This module exists so the UI can EXPLAIN what
   the database is already doing: why the pool looks small, and when it will
   grow. The numbers must therefore match the SQL exactly, which
   dispatch.test.ts pins.
   ============================================================ */

/** Minutes at each rung before the ring widens. */
export const DISPATCH_STEP_MINUTES = 10;

/** The first ring, in km. */
export const DISPATCH_START_KM = 3;

/** The last ring before a job opens to everyone, in km. */
export const DISPATCH_MAX_KM = 15;

/** Every radius the ladder passes through: 3, 5, 7, 9, 11, 13, 15. */
export const DISPATCH_LADDER_KM: number[] = (() => {
  const out: number[] = [];
  for (let km = DISPATCH_START_KM; km <= DISPATCH_MAX_KM; km += 2) out.push(km);
  return out;
})();

/**
 * The radius a job of this age is offered within, or null for "everyone".
 *
 * Mirrors dispatch_radius_for_age() in patch_v29. Null rather than a very
 * large number: past the cap there is genuinely no limit, and saying so is
 * more honest than a radius big enough to pretend.
 */
export function dispatchRadiusForAge(minutes: number | null | undefined): number | null {
  // An unknown or negative age (clock skew between the browser and Postgres)
  // is treated as brand new. Never wider than the starting ring.
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) {
    return DISPATCH_START_KM;
  }
  const step = Math.floor(minutes / DISPATCH_STEP_MINUTES);
  if (step >= DISPATCH_LADDER_KM.length) return null;
  return DISPATCH_LADDER_KM[step];
}

/** The radius for a job, from its `created_at`. */
export function dispatchRadiusKm(
  createdAt: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  if (!createdAt) return DISPATCH_START_KM;
  const started = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(started.getTime())) return DISPATCH_START_KM;
  return dispatchRadiusForAge((now.getTime() - started.getTime()) / 60000);
}

/**
 * Minutes until the ring next widens, or null if it never will again.
 *
 * What makes the wait legible: "widens in 4 min" is actionable, "3km" alone
 * just looks like a rule someone imposed.
 */
export function minutesUntilNextRing(
  createdAt: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  if (!createdAt) return DISPATCH_STEP_MINUTES;
  const started = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(started.getTime())) return DISPATCH_STEP_MINUTES;
  const elapsed = (now.getTime() - started.getTime()) / 60000;
  if (elapsed < 0) return DISPATCH_STEP_MINUTES;
  const step = Math.floor(elapsed / DISPATCH_STEP_MINUTES);
  if (step >= DISPATCH_LADDER_KM.length) return null;
  return Math.max(0, Math.ceil((step + 1) * DISPATCH_STEP_MINUTES - elapsed));
}

/** Great-circle distance in km. Mirrors km_between() in patch_v29. */
export function kmBetween(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  // Clamped for the same reason the SQL uses least(1, ...): two identical
  // points can land a hair above 1 and make asin() return NaN.
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * One line explaining the current ring, for the jobs list.
 *
 * Returns null when there is nothing worth saying — a job past the cap is
 * open to everyone, which is the state a pro already assumes.
 */
export function dispatchNote(
  createdAt: string | Date | null | undefined,
  now: Date = new Date()
): string | null {
  const km = dispatchRadiusKm(createdAt, now);
  if (km === null) return null;
  const mins = minutesUntilNextRing(createdAt, now);
  const next = km + 2;
  if (mins === null) return `Offered to pros within ${km}km.`;
  if (mins <= 1) return `Offered to pros within ${km}km — widening to ${next}km now.`;
  return `Offered to pros within ${km}km — widens to ${next}km in ${mins} min.`;
}
