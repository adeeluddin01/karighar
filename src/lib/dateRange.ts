/* ============================================================
   Date ranges for the statement screens.

   Pure and dependency-free so it can be unit-tested: the statement itself
   is a React screen that vitest (node env, *.test.ts only) cannot mount, but
   "what does 'last 3 months' actually mean" is exactly the part worth
   pinning.

   Every range is half-open [from, to): `from` inclusive at 00:00 local,
   `to` exclusive at the start of the day AFTER the end date. That is what
   makes "this month" include something booked at 23:59 on the 31st — an
   inclusive `to` at 00:00 would silently drop the last day.
   ============================================================ */

export type RangeKey = "all" | "thisMonth" | "last30" | "last90" | "thisYear" | "custom";

export type DateRange = {
  /** ISO instant, or null for "no lower bound". */
  from: string | null;
  /** ISO instant, exclusive. Null for "up to now". */
  to: string | null;
};

export const RANGE_PRESETS: { key: RangeKey; label: string }[] = [
  { key: "last30", label: "Last 30 days" },
  { key: "thisMonth", label: "This month" },
  { key: "last90", label: "Last 3 months" },
  { key: "thisYear", label: "This year" },
  { key: "all", label: "All time" },
];

/** Local midnight at the start of `d`'s day. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Midnight at the start of the day after `d` — the exclusive upper bound. */
function startOfNextDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

/**
 * Turn a preset into an actual range.
 *
 * `now` is injectable so the tests are not hostage to the clock. Local time
 * throughout, deliberately: a technician in Karachi thinking "this month"
 * means their month, not UTC's.
 */
export function resolveRange(key: RangeKey, now: Date = new Date()): DateRange {
  switch (key) {
    case "all":
      return { from: null, to: null };
    case "thisMonth":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: null,
      };
    case "last30":
      // 29 days back plus today = 30 days inclusive, which is what someone
      // means by "last 30 days" rather than 31 days of rows.
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)).toISOString(),
        to: null,
      };
    case "last90":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)).toISOString(),
        to: null,
      };
    case "thisYear":
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: null };
    case "custom":
      // The caller owns a custom range; this is only the neutral default it
      // starts from.
      return { from: null, to: null };
  }
}

/**
 * A range from two `<input type="date">` values ("2026-11-01"), either of
 * which may be blank.
 *
 * Returns nulls rather than throwing on nonsense input: a half-typed date is
 * a normal state while someone is still typing, not an error to shout about.
 */
export function customRange(fromDay: string, toDay: string): DateRange {
  const from = parseDay(fromDay);
  const to = parseDay(toDay);
  return {
    from: from ? startOfDay(from).toISOString() : null,
    // Exclusive upper bound, so the whole of the chosen end day is included.
    to: to ? startOfNextDay(to).toISOString() : null,
  };
}

function parseDay(v: string): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** True when `iso` falls inside the range. Null bounds are open. */
export function inRange(iso: string, range: DateRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (range.from && t < new Date(range.from).getTime()) return false;
  if (range.to && t >= new Date(range.to).getTime()) return false;
  return true;
}

/** "1 Nov – 30 Nov 2026", or "All time". For the screen's subtitle. */
export function describeRange(range: DateRange, now: Date = new Date()): string {
  if (!range.from && !range.to) return "All time";
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const from = range.from ? new Date(range.from) : null;
  // `to` is exclusive, so step back a day to name the last day a reader sees.
  const to = range.to ? new Date(new Date(range.to).getTime() - 1) : now;
  return from ? `${fmt(from)} – ${fmt(to)}` : `Up to ${fmt(to)}`;
}
