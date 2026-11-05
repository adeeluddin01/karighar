"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { useLanguage } from "@/lib/i18n";
import {
  DEFAULT_JOB_FILTERS,
  filterJobs,
  serviceOptions,
  statusOptions,
  type JobFilters,
  type ServiceOption,
} from "@/lib/jobFilters";
import { JobFilters as JobFiltersBar } from "@/components/JobFilters";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import {
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Pill,
  Spinner,
  formatPKR,
} from "@/components/ui";
import { type Job, type JobStatus } from "@/lib/types";

const OPEN = new Set<JobStatus>([
  "created",
  "bidding",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
]);

// Per-status action, mirroring the mobile bookings list (which already
// had these). The desktop list used to be a bare list with a status pill
// only, so a desktop customer had to open every booking to do anything.
// Returns a dictionary key — the label is translated at the call site.
function ctaFor(job: Job): string | null {
  switch (job.status) {
    case "assigned":
    case "en_route":
    case "arrived":
    case "in_progress":
      return "bookings.ctaTrack";
    case "bidding":
      return "bookings.ctaQuotes";
    case "completed":
      return "bookings.ctaConfirmPaid";
    case "paid":
      return "bookings.ctaRate";
    case "rated":
      return "bookings.ctaReceipt";
    default:
      return null;
  }
}

function stranded(job: Job): boolean {
  if (job.status !== "completed") return false;
  const updated = new Date(job.updated_at).getTime();
  return Number.isFinite(updated) && Date.now() - updated > 3 * 24 * 60 * 60 * 1000;
}

export default function BookingsPage() {
  const { user, loading } = useRequireAuth("/bookings");
  const { t, tStatus } = useLanguage();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fetching, setFetching] = useState(true);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_JOB_FILTERS);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const [{ data }, { data: svcRows }] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("services").select("id,name").eq("is_active", true).order("name"),
      ]);
      setJobs((data as Job[]) || []);
      setServices((svcRows as ServiceOption[]) || []);
      setFetching(false);
    })();
  }, [user]);

  const svc = useMemo(() => serviceOptions(jobs, services), [jobs, services]);
  const shown = useMemo(() => filterJobs(jobs, filters), [jobs, filters]);
  const statuses = useMemo(() => statusOptions(jobs), [jobs]);

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
        title={t("bookings.title")}
        subtitle={t("bookings.subtitle")}
        action={
          <LinkButton href="/book" size="sm" icon="plus">
            {t("bookings.bookService")}
          </LinkButton>
        }
      />

      {fetching ? (
        <Spinner />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="briefcase"
          title={t("bookings.none")}
          hint={t("bookings.noneHint")}
        >
          <LinkButton href="/book" size="sm">
            {t("bookings.bookService")}
          </LinkButton>
        </EmptyState>
      ) : (
        <>
          <div className="mb-4">
            <JobFiltersBar
              services={svc.options}
              hasCustom={svc.hasCustom}
              value={filters}
              onChange={setFilters}
              statusOptions={statuses}
            />
          </div>
          {shown.length === 0 ? (
            <Card className="text-center">
              <p className="text-muted-foreground">{t("filters.noMatch")}</p>
              <Button
                className="mt-4"
                variant="ghost"
                onClick={() => setFilters(DEFAULT_JOB_FILTERS)}
              >
                {t("filters.clear")}
              </Button>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {shown.map((job) => (
            <Link key={job.id} href={`/bookings/view/?id=${job.id}`} className="opt">
              <span className="flex w-full items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold">{job.title}</span>
                    {job.type === "custom" && <Pill tone="warn">{t("pro.customQuote")}</Pill>}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{job.address}</span>
                </span>
                <span className="whitespace-nowrap text-right">
                  <Pill tone={OPEN.has(job.status) ? "info" : "gray"}>
                    {tStatus(job.status)}
                  </Pill>
                  <span className="mt-2 block font-bold">{formatPKR(job.price)}</span>
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon name="calendar" size="sm" />
                {job.scheduled_at
                  ? new Date(job.scheduled_at).toLocaleString("en-PK")
                  : t("bookings.noTime")}
              </span>
              {ctaFor(job) && (
                <span className="mt-1 block text-xs font-semibold text-primary">
                  {t(ctaFor(job)!)}
                </span>
              )}
              {stranded(job) && (
                <span className="mt-1 block text-xs text-warning-foreground">
                  {t("bookings.stranded")}
                </span>
              )}
            </Link>
          ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
