import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Profile ratings — one shared data layer for the desktop and phone lanes
 * of `/profile/ratings`, so the two lanes cannot drift apart.
 *
 * Direction, from the viewer's own profile:
 * - "received": someone else rated the viewer.
 * - "given": the viewer rated someone else.
 *
 * Sources, all of which already exist — no new table is introduced here:
 * - `reviews`: customer -> provider, one per job (`job_id` unique).
 * - `customer_reviews`: provider -> customer, one per job.
 * - A business has no review table of its own: its ratings are the
 *   `reviews` rows on jobs it dispatched (`jobs.business_id`), which is
 *   exactly how `public_business_reviews` derives them.
 *
 * Who is shown, and why this does not leak customer PII:
 * - Names/avatars come only from `profiles` (id, full_name, avatar_url) —
 *   never from `customers`, which holds addresses and coordinates and has
 *   no public read policy.
 * - For a customer or a provider, the counterpart on a review is a job
 *   peer, and `profiles_job_peer` already lets job peers read each other's
 *   basic profile. No new policy is needed for those two roles.
 * - For a business, the reviewer is a customer on a job the business
 *   dispatched, which `profiles_job_peer` does NOT cover (it only covers
 *   the customer <-> technician pair). `supabase/patch_v25_business_review_peers.sql`
 *   adds that dispatcher case; until that patch is applied to the live
 *   database, the business lane falls back to the anonymous "Customer"
 *   label below instead of failing or leaking anything.
 * - The public pro/business pages are untouched: they keep showing
 *   stars + comment + date with no reviewer name. Full names appear only
 *   here, on the owner's own ratings page, and on the admin list.
 */

export type RatingDirection = "received" | "given";
export type AdminRatingKind = "to_provider" | "to_customer";
export type RatingTab = RatingDirection | AdminRatingKind;

export type RatingEntry = {
  id: string;
  job_id: string;
  job_title: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  /** Who the row is about, from the viewer's side: the reviewer for
   *  "received", the person rated for "given". */
  peer_id: string | null;
  peer_name: string | null;
  peer_avatar: string | null;
  /** Shown when RLS returns no profile row for the peer (e.g. the
   *  business-peer patch has not been applied yet). Never a guess. */
  peer_fallback: string;
  /** Admin list only: the author of the review. */
  author_name?: string | null;
  author_avatar?: string | null;
  author_fallback?: string;
  /** Admin list only: the dispatching business on this job, if any. */
  business_name?: string | null;
};

export type RatingPage = {
  entries: RatingEntry[];
  total: number;
  /** Average across ALL reviews in this tab, not just the loaded page. */
  avg: number | null;
};

export const RATINGS_PAGE_SIZE = 20;

type ReviewRow = {
  id: string;
  job_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type JobRow = {
  id: string;
  title: string | null;
  customer_id: string;
  provider_id: string | null;
  business_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

function avgOf(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((a, b) => a + b, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

async function fetchProfiles(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,avatar_url")
    .in("id", unique);
  for (const row of (data as ProfileRow[] | null) ?? []) map.set(row.id, row);
  return map;
}

async function fetchJobs(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, JobRow>> {
  const map = new Map<string, JobRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("jobs")
    .select("id,title,customer_id,provider_id,business_id")
    .in("id", unique);
  for (const row of (data as JobRow[] | null) ?? []) map.set(row.id, row);
  return map;
}

function toEntry(
  row: ReviewRow,
  jobs: Map<string, JobRow>,
  profiles: Map<string, ProfileRow>,
  peerId: string,
  peerFallback: string,
  author?: ProfileRow | null,
  authorFallback?: string
): RatingEntry {
  const peer = profiles.get(peerId);
  return {
    id: row.id,
    job_id: row.job_id,
    job_title: jobs.get(row.job_id)?.title ?? null,
    rating: row.rating,
    comment: row.comment,
    created_at: row.created_at,
    peer_id: peerId,
    peer_name: peer?.full_name ?? null,
    peer_avatar: peer?.avatar_url ?? null,
    peer_fallback: peerFallback,
    author_name: author?.full_name ?? null,
    author_avatar: author?.avatar_url ?? null,
    author_fallback: authorFallback,
  };
}

/**
 * One tab of the viewer's own ratings. `effectiveRole` is the output of
 * roleOf() — a pending provider or a suspended business falls back to
 * "customer" here, exactly as in navigation, so they see their customer
 * ratings until they are approved/active.
 */
export async function fetchMyRatingPage(
  supabase: SupabaseClient,
  userId: string,
  effectiveRole: "customer" | "provider" | "business",
  tab: RatingDirection,
  page: number
): Promise<RatingPage> {
  const from = page * RATINGS_PAGE_SIZE;
  const to = from + RATINGS_PAGE_SIZE - 1;

  // Business ratings are job-scoped, not a column on the business row.
  if (effectiveRole === "business") {
    if (tab === "given") return { entries: [], total: 0, avg: null };
    const { data: bizJobs } = await supabase
      .from("jobs")
      .select("id,title,customer_id,provider_id,business_id")
      .eq("business_id", userId);
    const jobs = new Map<string, JobRow>();
    for (const j of (bizJobs as JobRow[] | null) ?? []) jobs.set(j.id, j);
    const jobIds = [...jobs.keys()];
    if (jobIds.length === 0) return { entries: [], total: 0, avg: null };
    const [{ data: rows, count }, { data: all }] = await Promise.all([
      supabase
        .from("reviews")
        .select("id,job_id,customer_id,provider_id,rating,comment,created_at", { count: "exact" })
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .range(from, to),
      supabase.from("reviews").select("rating").in("job_id", jobIds),
    ]);
    const reviewRows = (rows as ReviewRow[] | null) ?? [];
    const profiles = await fetchProfiles(
      supabase,
      reviewRows.map((r) => r.customer_id)
    );
    return {
      entries: reviewRows.map((r) =>
        toEntry(r, jobs, profiles, r.customer_id, "Customer")
      ),
      total: count ?? reviewRows.length,
      avg: avgOf(((all as { rating: number }[] | null) ?? []).map((r) => r.rating)),
    };
  }

  const table = tab === "received"
    ? effectiveRole === "customer"
      ? "customer_reviews"
      : "reviews"
    : effectiveRole === "customer"
      ? "reviews"
      : "customer_reviews";
  const subjectCol = effectiveRole === "customer" ? "customer_id" : "provider_id";
  // Received: the peer is the author. Given: the peer is the subject.
  const peerCol =
    tab === "received"
      ? effectiveRole === "customer"
        ? "provider_id"
        : "customer_id"
      : effectiveRole === "customer"
        ? "provider_id"
        : "customer_id";
  const peerFallback =
    peerCol === "customer_id" ? "Customer" : "Provider";

  const [{ data: rows, count }, { data: all }] = await Promise.all([
    supabase
      .from(table)
      .select("id,job_id,customer_id,provider_id,rating,comment,created_at", { count: "exact" })
      .eq(subjectCol, userId)
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase.from(table).select("rating").eq(subjectCol, userId),
  ]);
  const reviewRows = (rows as ReviewRow[] | null) ?? [];
  const [jobs, profiles] = await Promise.all([
    fetchJobs(supabase, reviewRows.map((r) => r.job_id)),
    fetchProfiles(supabase, reviewRows.map((r) => r[peerCol])),
  ]);
  return {
    entries: reviewRows.map((r) =>
      toEntry(r, jobs, profiles, r[peerCol], peerFallback)
    ),
    total: count ?? reviewRows.length,
    avg: avgOf(((all as { rating: number }[] | null) ?? []).map((r) => r.rating)),
  };
}

/** Admin moderation list: every review of one kind, newest first. */
export async function fetchAdminRatingPage(
  supabase: SupabaseClient,
  kind: AdminRatingKind,
  page: number
): Promise<RatingPage> {
  const from = page * RATINGS_PAGE_SIZE;
  const to = from + RATINGS_PAGE_SIZE - 1;
  const table = kind === "to_provider" ? "reviews" : "customer_reviews";
  const [{ data: rows, count }, { data: all }] = await Promise.all([
    supabase
      .from(table)
      .select("id,job_id,customer_id,provider_id,rating,comment,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase.from(table).select("rating"),
  ]);
  const reviewRows = (rows as ReviewRow[] | null) ?? [];
  const [jobs, profiles] = await Promise.all([
    fetchJobs(supabase, reviewRows.map((r) => r.job_id)),
    fetchProfiles(
      supabase,
      reviewRows.flatMap((r) => [r.customer_id, r.provider_id])
    ),
  ]);
  // Business names for dispatched jobs, from the same profiles lookup
  // (an admin can read every profile row).
  const businessIds = reviewRows
    .map((r) => jobs.get(r.job_id)?.business_id)
    .filter((id): id is string => !!id);
  const businessProfiles = await fetchProfiles(supabase, businessIds);
  return {
    entries: reviewRows.map((r) => {
      const job = jobs.get(r.job_id);
      const subjectId = kind === "to_provider" ? r.provider_id : r.customer_id;
      const authorId = kind === "to_provider" ? r.customer_id : r.provider_id;
      const entry = toEntry(
        r,
        jobs,
        profiles,
        subjectId,
        kind === "to_provider" ? "Provider" : "Customer",
        profiles.get(authorId) ?? null,
        kind === "to_provider" ? "Customer" : "Provider"
      );
      return {
        ...entry,
        business_name: job?.business_id
          ? (businessProfiles.get(job.business_id)?.full_name ?? null)
          : null,
      };
    }),
    total: count ?? reviewRows.length,
    avg: avgOf(((all as { rating: number }[] | null) ?? []).map((r) => r.rating)),
  };
}
