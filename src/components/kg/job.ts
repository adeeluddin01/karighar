import type { KIconName } from "@/components/kg/icons";
import type { Job, JobStatus } from "@/lib/types";

/* Presentation helpers shared by the bookings list and the booking screen. */

/** Short human reference for a booking, as shown on the cards: "KG-4821". */
export function jobRef(id: string) {
  return "KG-" + id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

/** How the status reads on a pill, and which tone it takes. */
export const STATUS_PILL: Record<
  JobStatus,
  { label: string; tone?: "ok" | "warn" | "bad"; live?: boolean; icon?: KIconName }
> = {
  created: { label: "Finding a pro", tone: "warn" },
  bidding: { label: "Collecting quotes", tone: "warn" },
  assigned: { label: "Pro assigned", tone: "ok" },
  en_route: { label: "On the way", tone: "ok", live: true },
  arrived: { label: "Arrived", tone: "ok", live: true },
  in_progress: { label: "Work in progress", tone: "ok", live: true },
  completed: { label: "Payment pending", tone: "warn" },
  paid: { label: "Paid", tone: "ok", icon: "check" },
  rated: { label: "Completed", tone: "ok", icon: "check" },
  cancelled: { label: "Cancelled", tone: "bad" },
  disputed: { label: "Reported", tone: "bad", icon: "alert" },
};

/** The statuses the redesign's "Active" tab collects. */
export const ACTIVE_STATUSES: JobStatus[] = [
  "created",
  "bidding",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
];

export function isActiveJob(status: JobStatus) {
  return ACTIVE_STATUSES.includes(status);
}

/** A pro is physically on their way to or at the job. */
export function isLiveJob(status: JobStatus) {
  return status === "en_route" || status === "arrived" || status === "in_progress";
}

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** "Today · 3:30 PM", "Tomorrow · 10:00 AM", "28 Sep · 2:00 PM". */
export function whenLabel(job: Pick<Job, "scheduled_at" | "created_at">) {
  const iso = job.scheduled_at ?? job.created_at;
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-PK", TIME);
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date().setHours(0, 0, 0, 0)) /
      86_400_000
  );
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : days === -1
          ? "Yesterday"
          : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${day} · ${time}`;
}

/** "ASAP" bookings carry no scheduled time. */
export function scheduleLabel(job: Pick<Job, "scheduled_at" | "created_at">) {
  return job.scheduled_at ? whenLabel(job) : "ASAP";
}
