import type { Job, JobStatus, JobType } from "@/lib/types";

// Shared jobs-list filtering, used by the pro dashboard (both tabs), the pro
// map (same two lists as dots), and the customer bookings list — one module,
// so the three surfaces can't drift apart on what "filter" means.

export type JobTypeFilter = "all" | JobType;
export type JobSort = "newest" | "priceAsc" | "priceDesc" | "soonest";

export type JobFilters = {
  type: JobTypeFilter;
  /** "all" | a service id | "custom" (jobs with no service — custom requests). */
  serviceId: string;
  sort: JobSort;
  status: "all" | JobStatus;
};

export const SERVICE_CUSTOM = "custom";

export const DEFAULT_JOB_FILTERS: JobFilters = {
  type: "all",
  serviceId: "all",
  sort: "newest",
  status: "all",
};

export function isDefaultFilters(f: JobFilters): boolean {
  return (
    f.type === "all" && f.serviceId === "all" && f.sort === "newest" && f.status === "all"
  );
}

export type ServiceOption = { id: string; name: string };

/**
 * The service options for a loaded list of jobs: only services that
 * actually have a job in the list, in name order. A service with no job
 * in the list would filter to an empty page, so it is never offered.
 * `hasCustom` is true when at least one job has no service (a custom
 * request) — that bucket is offered as the "Custom request" option.
 */
export function serviceOptions(
  jobs: Job[],
  services: ServiceOption[]
): { options: ServiceOption[]; hasCustom: boolean } {
  const byId = new Map(services.map((s) => [s.id, s]));
  const seen = new Map<string, ServiceOption>();
  let hasCustom = false;
  for (const job of jobs) {
    if (job.service_id === null) {
      hasCustom = true;
    } else {
      const svc = byId.get(job.service_id);
      if (svc) seen.set(svc.id, svc);
    }
  }
  return {
    options: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
    hasCustom,
  };
}

/** Statuses present in a list, in the canonical status order. */
export function statusOptions(jobs: Job[]): JobStatus[] {
  const order: JobStatus[] = [
    "created",
    "bidding",
    "assigned",
    "en_route",
    "arrived",
    "in_progress",
    "completed",
    "paid",
    "rated",
    "cancelled",
    "disputed",
  ];
  const present = new Set(jobs.map((j) => j.status));
  return order.filter((s) => present.has(s));
}

function priceOf(job: Job): number | null {
  return job.price;
}

function comparePrice(a: Job, b: Job, ascending: boolean): number {
  const pa = priceOf(a);
  const pb = priceOf(b);
  // On-quote jobs have no price to order by — they always go last, in
  // either direction, rather than pretending Rs 0 or infinity.
  if (pa === null && pb === null) return 0;
  if (pa === null) return 1;
  if (pb === null) return -1;
  return ascending ? pa - pb : pb - pa;
}

function compareSoonest(a: Job, b: Job): number {
  const sa = a.scheduled_at ? new Date(a.scheduled_at).getTime() : null;
  const sb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : null;
  if (sa === null && sb === null) return 0;
  if (sa === null) return 1;
  if (sb === null) return -1;
  return sa - sb;
}

/**
 * Filter, then sort. Returns a new array; the input is never mutated.
 * Generic over the job subtype (plain Job, Pinned on the map, Enriched on
 * mobile bookings) so callers keep their extra fields.
 */
export function filterJobs<T extends Job>(jobs: T[], filters: JobFilters): T[] {
  const filtered = jobs.filter((job) => {
    if (filters.type !== "all" && job.type !== filters.type) return false;
    if (filters.serviceId !== "all") {
      if (filters.serviceId === SERVICE_CUSTOM) {
        if (job.service_id !== null) return false;
      } else if (job.service_id !== filters.serviceId) {
        return false;
      }
    }
    if (filters.status !== "all" && job.status !== filters.status) return false;
    return true;
  });

  const sorted = [...filtered];
  switch (filters.sort) {
    case "priceAsc":
      sorted.sort((a, b) => comparePrice(a, b, true));
      break;
    case "priceDesc":
      sorted.sort((a, b) => comparePrice(a, b, false));
      break;
    case "soonest":
      sorted.sort(compareSoonest);
      break;
    case "newest":
    default:
      sorted.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      break;
  }
  return sorted;
}
