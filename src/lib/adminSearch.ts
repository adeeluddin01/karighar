import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Emails for a set of accounts, for the admin screens.
 *
 * `profiles` has no email column — it lives in `auth.users`, which the anon
 * key cannot read. `admin_emails` (patch_v20) is a SECURITY DEFINER function
 * gated on is_admin() that takes ids and returns their addresses. It takes
 * ids rather than a search string on purpose: a lookup keyed on an email
 * would answer "does this person have an account here?" for anyone who could
 * reach it.
 *
 * Returns an empty map rather than throwing when the patch isn't applied, so
 * the screens still work and simply search name and phone only.
 */
export async function fetchEmails(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map();
  const { data, error } = await supabase.rpc("admin_emails", { p_ids: unique });
  if (error) return new Map();
  return new Map(
    ((data as { id: string; email: string | null }[]) ?? [])
      .filter((r) => r.email)
      .map((r) => [r.id, r.email as string])
  );
}

/**
 * Normalise a phone for comparison: digits only, last 10.
 *
 * The same Karachi number is stored as 03001234567, +923001234567 or
 * 0300-1234567 depending on who typed it, so a substring match on the raw
 * text misses most of them. Mirrors what business_invite_technician does in
 * SQL, for the same reason.
 */
export function phoneKey(v: string | null | undefined): string {
  const digits = (v ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Does this record match what the admin typed? Blank query matches all. */
export function matchesQuery(
  query: string,
  record: { name?: string | null; phone?: string | null; email?: string | null }
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  // A query that is mostly digits is a phone number; compare it as one so
  // formatting differences don't hide the row.
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length >= 4 && qDigits.length / q.replace(/\s/g, "").length > 0.6) {
    const key = phoneKey(q);
    if (key && phoneKey(record.phone).includes(key)) return true;
  }

  return (
    (record.name ?? "").toLowerCase().includes(q) ||
    (record.email ?? "").toLowerCase().includes(q) ||
    (record.phone ?? "").toLowerCase().includes(q)
  );
}
