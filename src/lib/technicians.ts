import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPublicPros, type PublicPro } from "./providers";

/* ============================================================
   Technicians, with the trades they actually offer.

   The Book tab lets a customer browse by person rather than by service, so
   each row has to say what that person does. `provider_services` cannot
   answer it — its only policy is `provsvc_self` (owner or admin), so to a
   customer the table is empty. patch_v31 adds `public_provider_services`,
   an owner-rights view over the same join, exactly as
   `public_business_services` has always done for companies.

   Degrades rather than fails. On a database that has not run patch_v31 the
   view is missing, PostgREST answers PGRST205, and the list still renders —
   every technician, with no trade chips and no category filter. That is the
   same bargain `fetchPublicPros` already strikes for
   `public_provider_profiles`.
   ============================================================ */

/** One technician as the Book tab shows them. */
export type Technician = PublicPro & {
  /** Distinct category ids this pro covers. Empty if the view is absent. */
  categoryIds: string[];
  /** Category names, for the chips under their name. */
  categoryNames: string[];
};

export type TechniciansResult = {
  technicians: Technician[];
  /** True when trades could not be loaded, so filtering is unavailable. */
  tradesUnavailable: boolean;
  error: string | null;
};

type ServiceRow = {
  provider_id: string;
  category_id: string;
  category_name: string;
  category_sort: number;
};

/**
 * Approved technicians, each with their trades.
 *
 * Ordered by the view's own rating/jobs ranking, so the people a customer is
 * most likely to want are first — the same order `/map` and the home rail
 * already use.
 */
export async function fetchTechnicians(
  supabase: SupabaseClient,
  opts: { limit?: number } = {}
): Promise<TechniciansResult> {
  const pros = await fetchPublicPros(supabase, { limit: opts.limit ?? 60 });
  if (pros.error) {
    return { technicians: [], tradesUnavailable: true, error: pros.error };
  }
  if (pros.pros.length === 0) {
    return { technicians: [], tradesUnavailable: false, error: null };
  }

  const ids = pros.pros.map((p) => p.id);
  const { data, error } = await supabase
    .from("public_provider_services")
    .select("provider_id,category_id,category_name,category_sort")
    .in("provider_id", ids);

  // A missing view is the one error worth surviving: the people are the
  // point of this screen, their trade chips are a refinement.
  const rows = (data as ServiceRow[]) || [];
  const byPro = new Map<string, ServiceRow[]>();
  for (const r of rows) {
    byPro.set(r.provider_id, [...(byPro.get(r.provider_id) ?? []), r]);
  }

  const technicians: Technician[] = pros.pros.map((p) => {
    const mine = (byPro.get(p.id) ?? []).slice().sort((a, b) => a.category_sort - b.category_sort);
    const seen = new Set<string>();
    const ids: string[] = [];
    const names: string[] = [];
    for (const r of mine) {
      if (seen.has(r.category_id)) continue;
      seen.add(r.category_id);
      ids.push(r.category_id);
      names.push(r.category_name);
    }
    return { ...p, categoryIds: ids, categoryNames: names };
  });

  return { technicians, tradesUnavailable: !!error, error: null };
}

/**
 * Narrow a list to one category, or everything when `categoryId` is "all".
 *
 * A technician with no trades on file is kept under "all" and dropped from
 * every specific filter: they are real and bookable, but claiming they do
 * plumbing when nothing says so would be worse than omitting them.
 */
export function filterTechnicians(list: Technician[], categoryId: string): Technician[] {
  if (!categoryId || categoryId === "all") return list;
  return list.filter((t) => t.categoryIds.includes(categoryId));
}

/**
 * Match a technician against a free-text query — their name or any trade.
 *
 * Deliberately not the areas they cover: those read like locations and this
 * list is not a location search.
 */
export function matchesTechnician(t: Technician, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((t.full_name ?? "").toLowerCase().includes(q)) return true;
  return t.categoryNames.some((n) => n.toLowerCase().includes(q));
}
