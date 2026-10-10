import { KARACHI_AREAS } from "./types";

// Addresses are stored as one string — "House 12, Block 7, Gulshan-e-Iqbal,
// Karachi" — assembled as `${line}, ${area}, Karachi` by the booking flow.

const ESC = /[.*+?^${}()|[\]\\]/g;

/** The comma-separated parts, with a trailing "Karachi" dropped. */
function parts(address: string) {
  const list = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return list.length > 1 && /^karachi$/i.test(list[list.length - 1]) ? list.slice(0, -1) : list;
}

/**
 * Best-effort area label, for the Home header and the booking cards.
 *
 * The area *slot* wins over a name that merely appears in the street line —
 * "Near DHA Phase 6 market, Clifton, Karachi" is in Clifton, not DHA.
 */
export function areaOf(address?: string | null): string | null {
  if (!address) return null;
  const list = parts(address);
  const slot = list[list.length - 1] ?? null;
  const known = KARACHI_AREAS.find((a) => a.toLowerCase() === slot?.toLowerCase());
  if (known) return known;
  // Not in our own format — fall back to scanning for any area we know.
  return KARACHI_AREAS.find((a) => address.toLowerCase().includes(a.toLowerCase())) ?? slot;
}

/**
 * Takes a stored address back apart into the street line and the area, so an
 * edit form can prefill without re-appending what's already there (which is
 * how you end up with "…, Gulshan-e-Iqbal, Gulshan-e-Iqbal, Karachi").
 *
 * Reports `area: null` when the string clearly wasn't assembled by us, so the
 * whole thing stays in the street line rather than vanishing into the picker.
 */
export function splitAddress(address?: string | null): { line: string; area: string | null } {
  if (!address) return { line: "", area: null };
  const area = areaOf(address);
  const line = address.replace(/,\s*Karachi\s*$/i, "").trim();
  if (!area) return { line, area: null };

  const stripped = line
    .replace(new RegExp(`,?\\s*${area.replace(ESC, "\\$&")}\\s*$`, "i"), "")
    .replace(/,\s*$/, "")
    .trim();
  return stripped ? { line: stripped, area } : { line, area: null };
}

/** The inverse: the single string the `jobs.address` column stores. */
export function joinAddress(line: string, area: string) {
  return `${line.trim()}, ${area}, Karachi`;
}
