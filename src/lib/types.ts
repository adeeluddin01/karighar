// Domain types mirroring supabase/schema.sql

export type UserRole = "customer" | "provider" | "admin";
export type ProviderStatus = "pending" | "approved" | "suspended" | "rejected";
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
  provider_id: string | null;
  commission_rate: number;
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
