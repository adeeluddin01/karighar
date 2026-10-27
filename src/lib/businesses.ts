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
  /**
   * Where the business actually is. Public because a business is a place
   * people can walk into — unlike a technician, who has areas but no address
   * and no coordinates anywhere in the schema. Null on a row granted before
   * patch_v22 made the premises mandatory.
   */
  lat: number | null;
  lng: number | null;
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
  /** The trades it covers, in catalogue order. Empty if it has set none. */
  trades: BusinessTrade[];
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
  const empty: BusinessResult = { business: null, reviews: [], trades: [], unavailable: false };
  if (!id) return empty;

  const [profileRes, reviewRes, svcRes] = await Promise.all([
    supabase.from("public_business_profiles").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("public_business_reviews")
      .select("review_key,rating,comment,created_at")
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("public_business_services")
      .select("business_id,category_id,category_name,category_icon,category_sort")
      .eq("business_id", id),
  ]);

  if (isMissing(profileRes.error?.code)) {
    return { business: null, reviews: [], trades: [], unavailable: true };
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
      lat: toCoord(row.lat),
      lng: toCoord(row.lng),
    },
    // The reviews and services views can be missing independently of the
    // profile view only on a half-applied patch; empty is the right fallback.
    reviews: reviewRes.error ? [] : ((reviewRes.data as BusinessReview[]) ?? []),
    trades:
      groupBusinessTrades(
        svcRes.error ? [] : ((svcRes.data as BusinessServiceRow[]) ?? [])
      ).get(id) ?? [],
    unavailable: false,
  };
}

/**
 * A coordinate that survived the round trip, or null.
 *
 * `Number(null)` is 0 and `Number("")` is 0 — and 0,0 is a real place in the
 * Atlantic, so a business with no premises recorded would otherwise be pinned
 * off the coast of Ghana rather than left off the map.
 */
function toCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** One row of `public_business_services`. */
export type BusinessServiceRow = {
  business_id: string;
  category_id: string;
  category_name: string;
  category_icon: string | null;
  category_sort: number;
};

/** A trade a business covers: what to draw, and what it means. */
export type BusinessTrade = { id: string; name: string; icon: string | null };

/**
 * Collapse the service rows to one entry per CATEGORY per business.
 *
 * The view returns a row per service, and a company that does eleven kinds of
 * plumbing would otherwise get eleven identical wrench icons. Categories are
 * what the icon set is keyed on anyway (`service_categories.icon`), so that
 * is the right grain. Ordered by the catalogue's own `sort_order` so every
 * business reads its trades in the same order as /book does.
 */
export function groupBusinessTrades(rows: BusinessServiceRow[]): Map<string, BusinessTrade[]> {
  const byBusiness = new Map<string, Map<string, BusinessTrade & { sort: number }>>();
  for (const r of rows) {
    if (!r?.business_id || !r.category_id) continue;
    let cats = byBusiness.get(r.business_id);
    if (!cats) {
      cats = new Map();
      byBusiness.set(r.business_id, cats);
    }
    if (!cats.has(r.category_id)) {
      cats.set(r.category_id, {
        id: r.category_id,
        name: r.category_name,
        icon: r.category_icon ?? null,
        sort: Number(r.category_sort ?? 0),
      });
    }
  }
  const out = new Map<string, BusinessTrade[]>();
  for (const [id, cats] of byBusiness) {
    out.set(
      id,
      [...cats.values()]
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        .map(({ id: cid, name, icon }) => ({ id: cid, name, icon }))
    );
  }
  return out;
}

/** A business as it appears on the map: a place, with the trades it covers. */
export type BusinessPin = {
  id: string;
  full_name: string | null;
  rating_avg: number;
  jobs_completed: number;
  team_size: number;
  lat: number;
  lng: number;
  trades: BusinessTrade[];
};

/**
 * Every active business that has a premises pinned, with its trades.
 *
 * Same never-throws contract as the rest of this module: an installation with
 * no businesses, or a database that predates patch_v18/v22, gets an empty
 * list rather than an error. That is what keeps the map identical for
 * everyone who does not use business accounts.
 */
export async function fetchBusinessPins(
  supabase: SupabaseClient,
  limit = 60
): Promise<BusinessPin[]> {
  const [bizRes, svcRes] = await Promise.all([
    supabase
      .from("public_business_profiles")
      .select("id,full_name,rating_avg,jobs_completed,team_size,lat,lng")
      .not("lat", "is", null)
      .order("rating_avg", { ascending: false })
      .limit(limit),
    supabase
      .from("public_business_services")
      .select("business_id,category_id,category_name,category_icon,category_sort"),
  ]);

  if (bizRes.error || !bizRes.data) return [];
  // The services view can be absent on a half-applied patch; a pin with no
  // trades still beats no pin at all.
  const trades = groupBusinessTrades(
    svcRes.error ? [] : ((svcRes.data as BusinessServiceRow[]) ?? [])
  );

  const pins: BusinessPin[] = [];
  for (const raw of bizRes.data as Record<string, unknown>[]) {
    const lat = toCoord(raw.lat);
    const lng = toCoord(raw.lng);
    if (lat === null || lng === null) continue;
    const id = String(raw.id);
    pins.push({
      id,
      full_name: (raw.full_name as string | null) ?? null,
      rating_avg: Number(raw.rating_avg ?? 0),
      jobs_completed: Number(raw.jobs_completed ?? 0),
      team_size: Number(raw.team_size ?? 0),
      lat,
      lng,
      trades: trades.get(id) ?? [],
    });
  }
  return pins;
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
