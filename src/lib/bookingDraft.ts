/* ============================================================
   Booking drafts kept across a sign-in round trip.

   The booking screens stash what the user typed in sessionStorage before
   sending them to sign in, then replay it on the way back. Two hazards made
   that unsafe:

   - The web and phone lanes used the *same* storage key for *different*
     shapes, so a draft written in one lane and read in the other restored
     garbage — and the resume effect books automatically, so garbage could be
     booked.
   - A stale draft from an older build had no way to be recognised as stale.

   So: a key per lane, a version stamp, and a type guard on the way out. A
   draft that does not match is dropped rather than trusted.
   ============================================================ */

export const DRAFT_VERSION = 1;

/** Versioned envelope. Readers check `v` before trusting anything else. */
export type Versioned = { v: number };

export function saveDraft(key: string, value: object): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ...value, v: DRAFT_VERSION }));
  } catch {
    // sessionStorage unavailable (private mode, storage full). The draft is a
    // convenience; losing it only costs the user a retype.
  }
}

/**
 * Read a draft, or `null` if it is absent, unparseable, the wrong version or
 * the wrong shape. Anything rejected is also *removed*, so a bad value cannot
 * keep failing on every visit.
 */
export function readDraft<T extends Versioned>(
  key: string,
  guard: (value: unknown) => value is T
): T | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (guard(parsed) && parsed.v === DRAFT_VERSION) return parsed;
  } catch {
    // fall through to the cleanup below
  }
  clearDraft(key);
  return null;
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** True for a non-null object — the precondition every guard starts from. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
