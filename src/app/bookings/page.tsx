"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  EmptyState,
  LinkButton,
  PageHeader,
  Pill,
  Spinner,
  formatPKR,
} from "@/components/ui";
import { JOB_STATUS_LABEL, type Job, type JobStatus } from "@/lib/types";

const OPEN = new Set<JobStatus>([
  "created",
  "bidding",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
]);

export default function BookingsPage() {
  const { user, loading } = useRequireAuth("/bookings");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("*")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      setJobs((data as Job[]) || []);
      setFetching(false);
    })();
  }, [user]);

  if (loading || !user) {
    return (
      <AppShell>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="My bookings"
        subtitle="Everything you've booked, newest first."
        action={
          <LinkButton href="/book" size="sm" icon="plus">
            Book a service
          </LinkButton>
        }
      />

      {fetching ? (
        <Spinner />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="briefcase"
          title="No bookings yet"
          hint="Book a plumber, electrician or AC technician in a couple of taps."
        >
          <LinkButton href="/book" size="sm">
            Book your first service
          </LinkButton>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {jobs.map((job) => (
            <Link key={job.id} href={`/bookings/view/?id=${job.id}`} className="opt">
              <span className="flex w-full items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold">{job.title}</span>
                    {job.type === "custom" && <Pill tone="warn">Custom</Pill>}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{job.address}</span>
                </span>
                <span className="whitespace-nowrap text-right">
                  <Pill tone={OPEN.has(job.status) ? "info" : "gray"}>
                    {JOB_STATUS_LABEL[job.status]}
                  </Pill>
                  <span className="mt-2 block font-bold">{formatPKR(job.price)}</span>
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon name="calendar" size="sm" />
                {job.scheduled_at
                  ? new Date(job.scheduled_at).toLocaleString("en-PK")
                  : "No time set"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
