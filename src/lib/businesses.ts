import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Public-facing business profile, from the `public_business_profiles` view
 * (supabase/patch_v18_business_accounts.sql). That view is the ONLY public
 * read path for a business: `biz_read` has no public branch, because the
 * table also carries `status`.
 *
 * `team_size` is a count on purpose — who is on the team is not public.
 */
export type PublicBusiness = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  about: string | null;
  rating_avg: number;
  jobs_completed: number;
  service_areas: string[];
  team_size: number;
};

/** One review of a business, from `public_business_reviews`. */
export type BusinessReview = {
  review_key: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type BusinessResult = {
  business: PublicBusiness | null;
  reviews: BusinessReview[];
  /**
   * True when the business-accounts patch hasn't been applied to this
   * database, so the views don't exist. Distinct from "no such business":
   * the caller shows the same not-found state either way, but this keeps a
   * missing migration from being reported to the user as a real error.
   */
  unavailable: boolean;
};

// PostgREST's code for "relation does not exist in the schema cache".
const MISSING_RELATION = "PGRST205";
const isMissing = (code?: string) => code === MISSING_RELATION;

/**
 * One business and its reviews, or nulls.
 *
 * Deliberately never throws and never surfaces an error to the caller.
 * Businesses are an optional feature: most installations have none, and a
 * database that predates patch_v18 has neither view. In both cases the right
 * answer is "nothing to show here", not a broken page — so a missing
 * relation is swallowed and reported as `unavailable`.
 */
export async function fetchPublicBusiness(
  supabase: SupabaseClient,
  id: string
): Promise<BusinessResult> {
  const empty: BusinessResult = { business: null, reviews: [], unavailable: false };
  if (!id) return empty;

  const [profileRes, reviewRes] = await Promise.all([
    supabase.from("public_business_profiles").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("public_business_reviews")
      .select("review_key,rating,comment,created_at")
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (isMissing(profileRes.error?.code)) {
    return { business: null, reviews: [], unavailable: true };
  }
  if (profileRes.error || !profileRes.data) return empty;

  const row = profileRes.data as Record<string, unknown>;
  return {
    business: {
      id: String(row.id),
      full_name: (row.full_name as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      about: (row.about as string | null) ?? null,
      rating_avg: Number(row.rating_avg ?? 0),
      jobs_completed: Number(row.jobs_completed ?? 0),
      service_areas: (row.service_areas as string[] | null) ?? [],
      team_size: Number(row.team_size ?? 0),
    },
    // The reviews view can be missing independently of the profile view only
    // on a half-applied patch; an empty list is the right fallback.
    reviews: reviewRes.error ? [] : ((reviewRes.data as BusinessReview[]) ?? []),
    unavailable: false,
  };
}

/** Just enough to name a dispatcher inline, without pulling its reviews. */
export type BusinessSummary = {
  id: string;
  full_name: string | null;
  rating_avg: number;
  jobs_completed: number;
};

/**
 * The dispatcher's name and rating, for the one line a customer sees on
 * their own booking. Separate from fetchPublicBusiness() because that one
 * also pulls 20 reviews, which this caller has no use for.
 *
 * Same contract: never throws, and returns null when the business-accounts
 * patch isn't applied, so a database without the feature shows nothing
 * rather than erroring.
 */
export async function fetchBusinessSummary(
  supabase: SupabaseClient,
  id: string | null | undefined
): Promise<BusinessSummary | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("public_business_profiles")
    .select("id,full_name,rating_avg,jobs_completed")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    full_name: (row.full_name as string | null) ?? null,
    rating_avg: Number(row.rating_avg ?? 0),
    jobs_completed: Number(row.jobs_completed ?? 0),
  };
}

/** What to call a business whose name we couldn't read. */
export function businessName(b: Pick<PublicBusiness, "full_name"> | null) {
  return b?.full_name?.trim() || "Service company";
}

/**
 * The label for a job's dispatcher, or null when there isn't one.
 *
 * `business_id` is null on every job unless a business dispatched it — and
 * the column does not exist at all on a database that predates patch_v18,
 * where it reads back as undefined. Both fall through to null, which is what
 * keeps the "dispatched by" line off every screen when nobody runs a
 * business account.
 */
export function dispatcherOf(job: { business_id?: string | null } | null | undefined) {
  return job?.business_id ?? null;
}
