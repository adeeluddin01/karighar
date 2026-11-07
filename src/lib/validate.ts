// Input validation / normalization helpers (Pakistan-specific). Pure & testable.

/* ============================================================
   The one place a field's rules live.

   This app is a static export (`output: "export"` in next.config.ts): there
   is no server, so every write goes from the browser straight to Supabase
   with the anon key that ships in the bundle. Nothing in this file is a
   security control — a crafted supabase-js call skips all of it. The real
   boundary is RLS plus the CHECK constraints in
   supabase/patch_v27_input_integrity.sql.

   What this file buys is a decent error *before* the round trip, and one
   definition of each limit instead of a different inline number per screen.
   `LIMITS` therefore has to stay in step with the SQL: if you change a cap
   here, change the matching CHECK there, or the user gets a Postgres error
   where they used to get a sentence.

   Convention, borrowed from validateAvatar() and validatePercent(): a
   validator returns a SENTENCE TO SHOW THE USER, or null when the value is
   fine. Not a boolean, not a code — these are all things the person can fix
   themselves, and the caller should never have to invent the wording.
   ============================================================ */

/**
 * Length caps, mirrored by CHECK constraints in patch_v27.
 *
 * Chosen to be generous for real use and hostile to abuse: with no server
 * tier, an unbounded `text` column is a self-serve way to push multi-MB rows
 * into a table nobody is rate-limiting per byte.
 */
export const LIMITS = {
  fullName: 80,
  /** Formatted with dashes — "42101-1234567-1" is 15. */
  cnic: 15,
  jobTitle: 120,
  jobDescription: 2000,
  /**
   * What the user types into a street-address box.
   *
   * Deliberately smaller than `address`: every booking stores
   * joinAddress(line, area) = "<line>, <area>, Karachi", so the value that
   * reaches the jobs.address CHECK is this plus roughly 40 characters. Cap
   * the box at the composed limit and a long line fails in the database
   * instead of in the form.
   */
  addressLine: 200,
  /** The composed value stored in jobs.address, mirrored by its CHECK. */
  address: 300,
  bio: 1000,
  messageText: 2000,
  disputeReason: 2000,
  reviewComment: 1000,
  bidNote: 300,
  cancelReason: 300,
  /** Catalog copy, admin-entered. */
  serviceName: 120,
  serviceDescription: 1000,
} as const;

/** The smallest password GoTrue is configured to accept. */
export const PASSWORD_MIN = 6;

/**
 * Upper bound on any rupee figure a client sends.
 *
 * Rs 10,000,000 is far above any plumbing job and well inside numeric(10,2),
 * so it rejects a fat-fingered or probing amount without ever rejecting a
 * real one.
 */
export const MAX_AMOUNT_PKR = 10_000_000;

// Normalize a Pakistani mobile number to +923XXXXXXXXX, or null if invalid.
// Accepts: 03001234567, 3001234567, +923001234567, 00923001234567, with spaces/dashes.
export function normalizePkPhone(input: string): string | null {
  let d = (input || "").replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^3\d{9}$/.test(d) ? "+92" + d : null;
}

export function isValidPkPhone(input: string): boolean {
  return normalizePkPhone(input) !== null;
}

// CNIC is 13 digits, usually shown as #####-#######-#.
export function isValidCnic(input: string): boolean {
  return (input || "").replace(/\D/g, "").length === 13;
}

export function formatCnic(input: string): string {
  const d = (input || "").replace(/\D/g, "").slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function isNonEmpty(input: string, min = 2): boolean {
  return (input || "").trim().length >= min;
}

/* ---------- field validators ---------- */

/**
 * Why this free-text value can't be used, or null if it can.
 *
 * The workhorse behind most of the others. `label` is interpolated into the
 * message, so pass something that reads naturally in "Your bio is too long"
 * — lowercase, no trailing punctuation.
 */
export function validateFreeText(
  input: string,
  { min = 0, max, label }: { min?: number; max: number; label: string }
): string | null {
  const text = (input ?? "").trim();
  if (text.length === 0) {
    // "Enter a description" reads better than "description is too short".
    return min > 0 ? `Enter ${label}.` : null;
  }
  if (text.length < min) {
    return `Please write a little more — ${label} needs at least ${min} characters.`;
  }
  if (text.length > max) {
    return `That ${label} is too long (${text.length} characters, max ${max}).`;
  }
  return null;
}

export function validateName(input: string): string | null {
  const text = (input ?? "").trim();
  if (text.length < 2) return "Enter your full name.";
  if (text.length > LIMITS.fullName) {
    return `That name is too long (max ${LIMITS.fullName} characters).`;
  }
  return null;
}

/** Wraps normalizePkPhone so the caller doesn't have to write the sentence. */
export function validatePhone(input: string): string | null {
  if (!(input ?? "").trim()) return "Enter your mobile number.";
  return isValidPkPhone(input)
    ? null
    : "Enter a valid Pakistani mobile number, e.g. 0300 1234567";
}

/**
 * Deliberately shallow: a format check, not an existence check.
 *
 * GoTrue is the real validator — it is the thing that has to deliver mail.
 * All this catches is the typo that would otherwise cost a round trip, so it
 * stays permissive rather than trying to police the local part.
 */
export function validateEmail(input: string): string | null {
  const text = (input ?? "").trim();
  if (!text) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
    return "That doesn't look like an email address.";
  }
  return null;
}

/**
 * The password rule, in JS rather than only in `minLength`.
 *
 * An HTML attribute is skipped by any submit that isn't a real form submit,
 * which is every programmatic path — so the check has to exist here too.
 */
export function validatePassword(input: string): string | null {
  const value = input ?? "";
  if (!value) return "Choose a password.";
  if (value.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters.`;
  }
  return null;
}

export function validateCnic(input: string): string | null {
  if (!(input ?? "").trim()) return "Enter your CNIC number.";
  return isValidCnic(input)
    ? null
    : "Enter a valid 13-digit CNIC, e.g. 42101-1234567-1";
}

/**
 * Why this rupee amount can't be used, or null if it can.
 *
 * Takes the raw input string rather than a number so that "" and "abc" get
 * their own message instead of both arriving as NaN.
 */
export function validateAmount(
  input: string,
  { min = 1, max = MAX_AMOUNT_PKR, label = "amount" }: { min?: number; max?: number; label?: string } = {}
): string | null {
  const text = (input ?? "").trim();
  if (!text) return `Enter an ${label}.`;
  const value = Number(text);
  if (!Number.isFinite(value)) return "That isn't a number.";
  if (value < min) return `The ${label} has to be at least ${formatAmount(min)}.`;
  if (value > max) return `The ${label} can't be more than ${formatAmount(max)}.`;
  return null;
}

/** Plain grouped digits for a validator message — no currency import needed here. */
function formatAmount(n: number): string {
  return `Rs ${n.toLocaleString("en-PK")}`;
}

/**
 * The first error among several fields, or null if they all pass.
 *
 * Lets a submit handler read as one guard instead of a stack of early
 * returns, and guarantees the user sees the topmost problem first.
 */
export function firstError(...errors: (string | null)[]): string | null {
  return errors.find((e) => e !== null) ?? null;
}

/**
 * `"2026-11-09"` + `"15:00"` -> an ISO timestamp, or null if unusable.
 *
 * All four booking screens did `new Date(`${date}T${time}`).toISOString()`
 * inline. On an invalid pair that is a RangeError, not a null — and because
 * it is thrown inside the submit handler, the booking screens' `postedRef`
 * latch stayed set and `busy` stayed true, leaving the form wedged with no
 * message. The date chips can't produce a bad pair, but a draft rehydrated
 * from sessionStorage can: isCustomDraft() only type-checks the strings, so
 * any leftover value reaches this unchecked.
 */
export function scheduledAtIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const at = new Date(`${date}T${time}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}
