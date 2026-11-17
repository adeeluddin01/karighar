import type { Job, JobStatus } from "./types";

// Mirrors the server-side status state machine in patch_v4_business_logic.sql.
// Kept in TS so the UI can guard actions before hitting the DB.
const GRAPH: Partial<Record<JobStatus, JobStatus[]>> = {
  created: ["assigned", "cancelled"],
  bidding: ["assigned", "cancelled"],
  assigned: ["en_route", "cancelled"],
  en_route: ["arrived", "cancelled"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["paid", "disputed"],
  paid: ["rated", "disputed"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return GRAPH[from]?.includes(to) ?? false;
}

/**
 * Where "Book again" goes from a finished job.
 *
 * Carries the SERVICE forward and nothing else. Deliberately NOT the
 * technician who did it: a customer cannot ask for a named pro, so a rebooked
 * job opens into the ordinary pool and is claimed through the dispatch ring,
 * exactly as the first one was.
 *
 * A custom job has no `service_id` — it is null by construction — so it
 * rebooks through the quotes form instead. A stale or since-retired service id
 * is safe to pass on: /book/service renders "Service not found" with a way
 * back to the catalogue.
 */
export function rebookHref(job: Pick<Job, "service_id" | "type">): string {
  if (job.service_id) return `/book/service/?id=${job.service_id}`;
  if (job.type === "custom") return "/book/custom";
  // A "fixed" job with no service_id should not exist, but landing on the
  // catalogue beats silently turning it into a custom quote.
  return "/book";
}
