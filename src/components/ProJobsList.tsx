"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { Icon } from "@/components/Icon";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Pill,
  Rating,
  Tabs,
  formatPKR,
} from "@/components/ui";
import type { Job, PublicCustomerRating } from "@/lib/types";

// The pro's jobs list, in one place. The dashboard (provider home) and the
// map tab's List area show the SAME list — same tabs, same filters, same
// accept/quote actions — so it lives here instead of being copied between
// the two pages. The pages own the data and the mutations; this owns the
// list UI state (tab, filters, bid form).
//
// Filters are uncontrolled by default (dashboard). The map tab passes its
// own filters in, so the list area and the map dots filter as one set —
// filter to AC jobs in the list, switch to the map, and the dots match.

type Tab = "open" | "active";

export function ProJobsList({
  available,
  mine,
  services,
  custRatings,
  atCap,
  attached,
  teamName,
  onAccept,
  onSubmitBid,
  headerActions,
  filters: controlledFilters,
  onFiltersChange,
}: {
  available: Job[];
  mine: Job[];
  services: ServiceOption[];
  custRatings: Map<string, PublicCustomerRating>;
  /** Freelance cap reached — Accept disables (the DB enforces it too). */
  atCap: boolean;
  /** On a business team: no open pool, only Your jobs. */
  attached: boolean;
  teamName?: string | null;
  /** Claim a fixed job. Never throws — the page toasts and reloads. */
  onAccept: (job: Job) => Promise<void>;
  /** Send a quote on a custom job. Never throws. */
  onSubmitBid: (jobId: string, amount: number, note: string | null) => Promise<void>;
  /** Extra controls in the tab row — the dashboard's History button. */
  headerActions?: React.ReactNode;
  filters?: JobFilters;
  onFiltersChange?: (next: JobFilters) => void;
}) {
  const { t, tStatus } = useLanguage();
  const [tab, setTab] = useState<Tab>("open");
  const [internalFilters, setInternalFilters] = useState<JobFilters>(DEFAULT_JOB_FILTERS);
  const filters = controlledFilters ?? internalFilters;
  const setFilters = onFiltersChange ?? setInternalFilters;
  const [bidFor, setBidFor] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidNote, setBidNote] = useState("");
  const [busy, setBusy] = useState(false);

  const effTab: Tab = attached ? "active" : tab;
  const list = effTab === "open" ? available : mine;
  // Service options come from BOTH lists, so switching tabs never leaves
  // the selected service without an option.
  const svc = useMemo(
    () => serviceOptions([...available, ...mine], services),
    [available, mine, services]
  );
  const shown = useMemo(() => filterJobs(list, filters), [list, filters]);
  const activeStatuses = useMemo(() => statusOptions(mine), [mine]);

  // A status only exists on one tab — carrying "assigned" over to the Open
  // tab (created/bidding only) would filter everything out, so switching
  // tabs resets it.
  function changeTab(next: Tab) {
    setTab(next);
    if (filters.status !== "all") setFilters({ ...filters, status: "all" });
  }

  async function accept(job: Job) {
    setBusy(true);
    try {
      await onAccept(job);
    } finally {
      setBusy(false);
    }
  }

  async function submitBid(jobId: string) {
    const amount = Number(bidAmount);
    if (!amount) return;
    setBusy(true);
    try {
      await onSubmitBid(jobId, amount, bidNote || null);
      setBidFor(null);
      setBidAmount("");
      setBidNote("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {attached ? (
          <h2 className="text-xl font-bold tracking-tight">
            {t("pro.yourJobs")}
            {mine.length ? ` (${mine.length})` : ""}
          </h2>
        ) : (
          <Tabs
            value={tab}
            onChange={changeTab}
            tabs={[
              { key: "open", label: `${t("pro.open")}${available.length ? ` (${available.length})` : ""}` },
              { key: "active", label: `${t("pro.yourJobs")}${mine.length ? ` (${mine.length})` : ""}` },
            ]}
          />
        )}
        {headerActions}
      </div>

      {/* Filters — same bar on both tabs and on the map, so a pro filters
          the same way wherever they browse jobs. Unconditional: hiding it
          when the list is empty made the feature look missing. */}
      <div className="mb-4">
        <JobFiltersBar
          services={svc.options}
          hasCustom={svc.hasCustom}
          value={filters}
          onChange={setFilters}
          statusOptions={effTab === "active" ? activeStatuses : undefined}
          layout="stack"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={effTab === "open" ? "party" : "calendar"}
          title={t("pro.nothingYet")}
          hint={
            effTab === "open"
              ? t("pro.noOpenHint")
              : attached
                ? `${teamName ?? "Your business"} hasn't sent you anything yet. New jobs show up here.`
                : t("pro.noMineHint")
          }
        />
      ) : shown.length === 0 ? (
        <Card className="text-center">
          <p className="text-muted-foreground">{t("filters.noMatch")}</p>
          <Button className="mt-4" variant="ghost" onClick={() => setFilters(DEFAULT_JOB_FILTERS)}>
            {t("filters.clear")}
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {effTab === "active"
            ? shown.map((job) => (
                <Link key={job.id} href={`/pro/jobs/view/?id=${job.id}`} className="opt">
                  <span className="flex w-full items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{job.title}</span>
                      <span className="block text-sm text-muted-foreground">{job.address}</span>
                    </span>
                    <span className="whitespace-nowrap text-end">
                      <Pill tone="info">{tStatus(job.status)}</Pill>
                      <span className="mt-2 block font-bold">{formatPKR(job.price)}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Icon name="calendar" size="sm" />
                      {job.scheduled_at
                        ? new Date(job.scheduled_at).toLocaleString("en-PK")
                        : t("pro.flexibleTime")}
                    </span>
                    <CustomerRating rating={custRatings.get(job.customer_id)} />
                  </span>
                </Link>
              ))
            : shown.map((job) => (
                <Card key={job.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold">{job.title}</h3>
                        {job.type === "custom" && <Pill tone="warn">{t("pro.customQuote")}</Pill>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{job.address}</p>
                      {job.description && <p className="mt-1 text-sm">{job.description}</p>}
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Icon name="calendar" size="sm" />
                          {job.scheduled_at
                            ? new Date(job.scheduled_at).toLocaleString("en-PK")
                            : t("pro.flexibleTime")}
                        </span>
                        <CustomerRating rating={custRatings.get(job.customer_id)} />
                      </p>
                    </div>
                    <div className="whitespace-nowrap text-end">
                      <p className="font-bold text-primary">{formatPKR(job.price)}</p>
                      {job.type === "fixed" ? (
                        <Button
                          size="sm"
                          className="mt-2"
                          disabled={busy || atCap}
                          onClick={() => accept(job)}
                        >
                          {atCap ? t("pro.atCap") : t("pro.accept")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2"
                          onClick={() => setBidFor(bidFor === job.id ? null : job.id)}
                        >
                          {bidFor === job.id ? t("common.close") : t("pro.sendQuote")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {bidFor === job.id && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        placeholder={t("pro.yourQuote")}
                        aria-label={t("pro.yourQuote")}
                        prefix="Rs"
                      />
                      <Input
                        value={bidNote}
                        onChange={(e) => setBidNote(e.target.value)}
                        placeholder={t("pro.quoteNote")}
                        aria-label={t("pro.quoteNote")}
                      />
                      <Button disabled={busy} className="w-full" onClick={() => submitBid(job.id)}>
                        {t("pro.submitQuote")}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
        </div>
      )}
    </>
  );
}

/**
 * The customer's rating, as a pro sees it before accepting. A customer with no
 * ratings yet reads as "New customer" rather than 0.0 stars.
 */
function CustomerRating({ rating }: { rating?: PublicCustomerRating }) {
  const { t } = useLanguage();
  if (!rating || rating.jobs_rated === 0) {
    return <span>{t("pro.newCustomer")}</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <Rating value={rating.rating_avg} />
      <span>
        ({rating.jobs_rated} {rating.jobs_rated === 1 ? "rating" : "ratings"})
      </span>
    </span>
  );
}
