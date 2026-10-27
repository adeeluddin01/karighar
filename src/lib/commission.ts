/**
 * Commission rates are stored as a FRACTION (0.2), and every admin screen
 * talks in PERCENT (20). Getting that conversion wrong by a factor of 100 is
 * the whole risk here — a rate typed as "20" and stored unconverted would
 * charge 2000% — so both directions live in one tested place rather than
 * being re-derived at each call site.
 */

/** Which kind of account a default governs. Mirrors the RPC's `p_scope`. */
export type CommissionScope = "provider" | "business";

/** One account kind's pair of rates. */
export type RatePair = { fixed: number; custom: number };

/**
 * The platform defaults row (`platform_settings`). Four numbers, because
 * Karighar charges a solo technician and a dispatching company on different
 * terms, and a catalogue booking on different terms from an on-site quote.
 * Each pair is edited on the admin tab for the accounts it governs.
 */
export type PlatformSettings = {
  provider_fixed: number;
  provider_custom: number;
  business_fixed: number;
  business_custom: number;
  updated_at: string | null;
};

/** Fallbacks matching the column defaults, for a database without the row. */
export const DEFAULT_COMMISSION: Record<CommissionScope, RatePair> = {
  provider: { fixed: 0.2, custom: 0.15 },
  business: { fixed: 0.2, custom: 0.15 },
};

/** The columns that hold one scope's pair, so callers don't hand-build names. */
export function ratePairOf(row: PlatformSettings | null, scope: CommissionScope): RatePair {
  if (!row) return DEFAULT_COMMISSION[scope];
  return scope === "business"
    ? { fixed: Number(row.business_fixed), custom: Number(row.business_custom) }
    : { fixed: Number(row.provider_fixed), custom: Number(row.provider_custom) };
}

/** The four columns to select, in one place so the two tabs agree. */
export const PLATFORM_RATE_COLUMNS =
  "provider_fixed,provider_custom,business_fixed,business_custom,updated_at";

/** 0.2 -> "20". Trims a trailing ".0" so whole rates read as whole numbers. */
export function toPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "";
  const pct = Math.round(rate * 1000) / 10;
  return String(pct);
}

/**
 * "20" -> 0.2, or null if it isn't a usable rate.
 *
 * Null for empty input is meaningful, not an error: on a per-account field it
 * is how an admin CLEARS an override back to the platform default.
 */
export function fromPercent(input: string): number | null {
  const text = (input ?? "").trim().replace(/%$/, "");
  if (text === "") return null;
  const pct = Number(text);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  // 3dp is what numeric(4,3) holds, i.e. 0.1% resolution.
  return Math.round(pct * 10) / 1000;
}

/** Why that percentage can't be used, or null if it can. */
export function validatePercent(input: string, { required = false } = {}): string | null {
  const text = (input ?? "").trim().replace(/%$/, "");
  if (text === "") return required ? "Enter a commission percentage." : null;
  const pct = Number(text);
  if (!Number.isFinite(pct)) return "That isn't a number.";
  if (pct < 0 || pct > 100) return "A commission has to be between 0 and 100%.";
  return null;
}

/**
 * What an account is actually charged, and whether that is its own deal.
 *
 * `override` is the nullable column on `providers`/`businesses`; null means
 * the account simply follows the platform, which is the case for everyone
 * the admin has never singled out.
 */
export function effectiveRate(
  override: number | null | undefined,
  platformDefault: number
): { rate: number; custom: boolean } {
  return override === null || override === undefined
    ? { rate: platformDefault, custom: false }
    : { rate: override, custom: true };
}
