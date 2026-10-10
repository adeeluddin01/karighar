import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Public-facing pro profile. Normally comes from the `public_provider_profiles`
 * view (supabase/patch_v7_provider_profiles.sql), which joins `providers` to
 * `profiles` and exposes only the safe columns.
 */
export type PublicPro = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  rating_avg: number;
  jobs_completed: number;
  service_areas: string[];
};

export type ProsResult = {
  pros: PublicPro[];
  /**
   * True when the view is missing and we fell back to `providers` directly.
   * That table is readable but `profiles` is not, so names come back null.
   */
  degraded: boolean;
  /** A real failure, worth showing the user. Null when the fetch worked. */
  error: string | null;
};

// PostgREST's code for "relation does not exist in the schema cache".
const MISSING_RELATION = "PGRST205";

type Row = Record<string, unknown>;

function fromView(r: Row): PublicPro {
  return {
    id: String(r.id),
    full_name: (r.full_name as string | null) ?? null,
    avatar_url: (r.avatar_url as string | null) ?? null,
    bio: (r.bio as string | null) ?? null,
    rating_avg: Number(r.rating_avg ?? 0),
    jobs_completed: Number(r.jobs_completed ?? 0),
    service_areas: (r.service_areas as string[] | null) ?? [],
  };
}

function fromProviders(r: Row): PublicPro {
  return {
    id: String(r.profile_id),
    full_name: null,
    avatar_url: null,
    bio: (r.bio as string | null) ?? null,
    rating_avg: Number(r.rating_avg ?? 0),
    jobs_completed: Number(r.jobs_completed ?? 0),
    service_areas: (r.service_areas as string[] | null) ?? [],
  };
}

/**
 * Approved pros, newest-reputation first.
 *
 * Falls back to reading `providers` when the view hasn't been created, so the
 * screens still show the real pros instead of an empty state that reads as
 * "there are none" — and reports `degraded` so a caller can say why names are
 * missing rather than silently showing blanks.
 */
export async function fetchPublicPros(
  supabase: SupabaseClient,
  { limit, id, ids }: { limit?: number; id?: string; ids?: string[] } = {}
): Promise<ProsResult> {
  // Nothing to look up — skip the round-trip entirely.
  if (ids && ids.length === 0) return { pros: [], degraded: false, error: null };

  let q = supabase
    .from("public_provider_profiles")
    .select("id,full_name,avatar_url,bio,rating_avg,jobs_completed,service_areas");
  if (id) q = q.eq("id", id);
  if (ids) q = q.in("id", ids);
  q = q.order("rating_avg", { ascending: false }).order("jobs_completed", { ascending: false });
  if (limit) q = q.limit(limit);

  const { data, error } = await q;
  if (!error) {
    return { pros: ((data as Row[]) ?? []).map(fromView), degraded: false, error: null };
  }
  if (error.code !== MISSING_RELATION) {
    return { pros: [], degraded: false, error: error.message };
  }

  // Compatibility path for a project that never ran patch_v7. It only works
  // while `providers` is still world-readable — patch_v11 closes that, because
  // the table also holds CNIC numbers. Both changes are in that one patch, so
  // a project that applies v11 gets the view and never lands here.
  //
  // It can't match the view exactly: the view also requires the profile's
  // role to be 'provider', and `profiles` isn't readable from here.
  let f = supabase
    .from("providers")
    .select("profile_id,bio,rating_avg,jobs_completed,service_areas")
    .eq("status", "approved");
  if (id) f = f.eq("profile_id", id);
  if (ids) f = f.in("profile_id", ids);
  f = f.order("rating_avg", { ascending: false }).order("jobs_completed", { ascending: false });
  if (limit) f = f.limit(limit);

  const { data: rows, error: fallbackError } = await f;
  if (fallbackError) {
    return { pros: [], degraded: true, error: fallbackError.message };
  }
  return { pros: ((rows as Row[]) ?? []).map(fromProviders), degraded: true, error: null };
}

/** What to call a pro whose name we couldn't read. */
export function proName(pro: Pick<PublicPro, "full_name">) {
  return pro.full_name?.trim() || "Verified pro";
}
