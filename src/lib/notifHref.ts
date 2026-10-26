import type { Role } from "@/components/nav";

/* ============================================================
   Where tapping a notification should go.

   Every caller used to hard-code `/bookings/view/?id=…`, which is the
   *customer's* booking page. A provider tapping "New job assigned" therefore
   landed on a page `jobs_select` RLS will not show them — the alert looked
   broken. The destination is a function of the reader's role, not of the
   notification.
   ============================================================ */

/**
 * One entry per role, as a `Record` rather than a `switch (role)` with a
 * `default:`. The switch compiled fine when `Role` gained "business" and sent
 * a dispatcher to the customer booking page — a silent wrong answer. A
 * `Record<Role, …>` is the same shape as NAV/ROLE_HOME in components/nav.ts
 * and makes the compiler demand the next one.
 */
const JOB_HREF: Record<Role, (jobId: string) => string | null> = {
  // "guest" is also what roleOf() reports in the moment before useUser()
  // resolves, so this is not only the signed-out case. The customer page is
  // the right landing either way: it bounces a genuinely signed-out visitor
  // to sign-in, which is the usual pattern.
  guest: (id) => `/bookings/view/?id=${id}`,
  customer: (id) => `/bookings/view/?id=${id}`,
  provider: (id) => `/pro/jobs/view/?id=${id}`,
  // A business follows its dispatched jobs from the board, which is also
  // where it can reassign them. There is no per-job dispatcher page.
  business: () => "/business/",
  // Admins have a jobs list but no per-job page, so send them to the list.
  admin: () => "/admin/jobs/",
};

/**
 * `null` means "nothing to open" — callers must not navigate.
 *
 * A notification can legitimately have no job: a team invite, for instance.
 * Those still render in the list, just without a destination.
 */
export function notifHref(n: { job_id: string | null }, role: Role): string | null {
  if (!n.job_id) return null;
  return JOB_HREF[role](n.job_id);
}

/**
 * Where a notification that carries no job should go, if anywhere.
 *
 * Keyed on the notification TYPE as well as the role, because that is what
 * distinguishes them: a `business_invite` is the only job-less notification
 * either side can act on, and the two sides act on it in different places.
 *
 * The technician's end is /pro/dashboard rather than /profile: only an
 * APPROVED technician can be invited, so the dashboard is already their home
 * (ROLE_HOME.provider) and already a tab on both lanes.
 */
export function notifFallbackHref(
  n: { job_id: string | null; type: string },
  role: Role
): string | null {
  if (n.job_id) return null;
  if (n.type === "business_invite") {
    return role === "business" ? "/business/team/" : "/pro/dashboard/";
  }
  return null;
}
