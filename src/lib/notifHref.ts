import type { Role } from "@/components/nav";

/* ============================================================
   Where tapping a notification should go.

   Every caller used to hard-code `/bookings/view/?id=…`, which is the
   *customer's* booking page. A provider tapping "New job assigned" therefore
   landed on a page `jobs_select` RLS will not show them — the alert looked
   broken. The destination is a function of the reader's role, not of the
   notification.
   ============================================================ */

/** `null` means "nothing to open" — callers must not navigate. */
export function notifHref(n: { job_id: string | null }, role: Role): string | null {
  if (!n.job_id) return null;
  switch (role) {
    case "provider":
      return `/pro/jobs/view/?id=${n.job_id}`;
    // Admins have a jobs list but no per-job page, so send them to the list.
    case "admin":
      return "/admin/jobs/";
    default:
      return `/bookings/view/?id=${n.job_id}`;
  }
}
