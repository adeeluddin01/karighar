// Domain types mirroring supabase/schema.sql

export type UserRole = "customer" | "provider" | "admin" | "business";
export type ProviderStatus = "pending" | "approved" | "suspended" | "rejected";
export type BusinessStatus = "active" | "suspended";
export type MembershipStatus = "invited" | "active" | "declined" | "removed";
export type JobType = "fixed" | "custom";
export type JobStatus =
  | "created"
  | "bidding"
  | "assigned"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "paid"
  | "rated"
  | "cancelled"
  | "disputed";

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type ServiceCategory = {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

export type Service = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  unit: string;
  visit_fee: number;
  is_active: boolean;
};

export type Customer = {
  profile_id: string;
  default_address: string | null;
  lat: number | null;
  lng: number | null;
  rating_avg: number;
  jobs_rated: number;
};

export type Provider = {
  profile_id: string;
  cnic_no: string | null;
  status: ProviderStatus;
  bio: string | null;
  rating_avg: number;
  jobs_completed: number;
  service_areas: string[];
  verified_at: string | null;
  /**
   * Karighar's cut for this one pro, or null to follow the platform default.
   * Admin-owned — `providers_guard_trusted_cols` coerces it back on a
   * self-write, or a pro could set their own commission to zero.
   */
  commission_rate: number | null;
};

/**
 * A real trading entity that dispatches jobs to technicians on its team.
 * Granted by Karighar, never self-selected — which is why the identity and
 * premises below are recorded by the admin at grant time and coerced back by
 * `businesses_guard_trusted_cols` on any self-write. Every technician beneath
 * it is still individually verified in their own right.
 */
export type Business = {
  profile_id: string;
  status: BusinessStatus;
  about: string | null;
  service_areas: string[];
  // Admin-owned. The business may edit `about` and `service_areas`, nothing else here.
  cnic_no: string | null;
  cnic_front_url: string | null;
  cnic_back_url: string | null;
  owner_selfie_url: string | null;
  verified_at: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /**
   * Karighar's cut for this one company, or null for the platform default.
   * On a dispatched job the BUSINESS is billed, so this is the rate that
   * applies and the technician's own override is ignored. Admin-owned.
   */
  commission_rate: number | null;
  rating_avg: number;
  jobs_completed: number;
  created_at: string;
};

/**
 * One technician's place on one business's team, plus the invite state and
 * the split they agreed. `tech_share` is the fraction of the job price the
 * TECHNICIAN keeps; the business keeps the rest and pays Karighar's
 * commission out of its side.
 */
export type BusinessMember = {
  id: string;
  business_id: string;
  provider_id: string;
  status: MembershipStatus;
  tech_share: number;
  invited_by: string | null;
  invited_at: string;
  responded_at: string | null;
  removed_at: string | null;
};

/**
 * The `public_business_profiles` view — no phone, no member identities, and
 * never the CNIC or street address. Coordinates are public because a business
 * is a place people can find.
 */
export type PublicBusinessProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  about: string | null;
  rating_avg: number;
  jobs_completed: number;
  service_areas: string[];
  lat: number | null;
  lng: number | null;
  team_size: number;
};

export type Job = {
  id: string;
  customer_id: string;
  type: JobType;
  service_id: string | null;
  title: string;
  description: string | null;
  photos: string[];
  status: JobStatus;
  address: string;
  lat: number | null;
  lng: number | null;
  scheduled_at: string | null;
  price: number | null;
  /** Whoever is doing the work — for a dispatched job, the technician. */
  provider_id: string | null;
  commission_rate: number;
  /**
   * The dispatching business, recorded alongside the technician. Both this
   * and `tech_share` are stamped by a trigger whenever `provider_id` is set,
   * and frozen thereafter — membership and the split can change before the
   * job is paid. Null for an independent pro.
   */
  business_id: string | null;
  tech_share: number | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type Bid = {
  id: string;
  job_id: string;
  provider_id: string;
  amount: number;
  note: string | null;
  eta_minutes: number | null;
  status: "pending" | "awarded" | "rejected";
  created_at: string;
};

// Human-friendly labels + ordering for the status timeline.
export const JOB_STATUS_FLOW: JobStatus[] = [
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "paid",
  "rated",
];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  created: "Finding a pro",
  bidding: "Collecting quotes",
  assigned: "Pro assigned",
  en_route: "On the way",
  arrived: "Arrived",
  in_progress: "Work in progress",
  completed: "Completed",
  paid: "Paid",
  rated: "Rated",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  job_id: string | null;
  read: boolean;
  created_at: string;
};

/**
 * A Karighar promo banner. Copy lives in the database so it can change
 * without a redeploy; RLS only returns rows that are currently live.
 */
export type HousePromo = {
  id: string;
  audience: "provider" | "customer" | "all";
  eyebrow: string | null;
  title: string;
  body: string | null;
  cta_label: string | null;
  href: string | null;
  priority: number;
};

/** Customer -> provider. One per job; `reviews.job_id` is unique. */
export type Review = {
  id: string;
  job_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

/**
 * Provider -> customer, the other direction. A separate table rather than a
 * column on `reviews`, whose unique `job_id` and triggers are load-bearing.
 * `provider_id` is the author here, `customer_id` the subject.
 */
export type CustomerReview = {
  id: string;
  job_id: string;
  provider_id: string;
  customer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

/**
 * The `public_customer_ratings` view: the aggregates only. `customers` itself
 * holds the address and coordinates, and RLS is row-level rather than
 * column-level, so ratings go out through a view instead — the same shape of
 * fix as `public_provider_profiles`.
 */
export type PublicCustomerRating = {
  id: string;
  rating_avg: number;
  jobs_rated: number;
};

export const KARACHI_AREAS = [
  "Gulshan-e-Iqbal",
  "DHA",
  "Clifton",
  "Nazimabad",
  "North Nazimabad",
  "Gulistan-e-Johar",
  "Malir",
  "Korangi",
  "Saddar",
  "PECHS",
  "Federal B Area",
  "Bahadurabad",
  "Shah Faisal",
  "Landhi",
];
