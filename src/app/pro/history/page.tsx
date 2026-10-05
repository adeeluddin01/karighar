"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Pill,
  Spinner,
  Stat,
  formatPKR,
} from "@/components/ui";
import { summarizeLedger, type LedgerEntry, type LedgerSummary } from "@/lib/money";
import { JOB_STATUS_LABEL, type Job } from "@/lib/types";
import { BRAND } from "@/lib/config";

export default function ProviderHistoryPage() {
  const { user, loading } = useRequireAuth("/pro/history");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [wallet, setWallet] = useState<LedgerSummary | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const [{ data: jobRows }, { data: ledger }] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("provider_id", user.id)
          .in("status", ["paid", "rated", "cancelled"])
          .order("updated_at", { ascending: false }),
        supabase.from("provider_ledger").select("type,amount").eq("provider_id", user.id),
      ]);
      setJobs((jobRows as Job[]) || []);
      setWallet(summarizeLedger((ledger as LedgerEntry[]) || []));
      setFetching(false);
    })();
  }, [user]);

  const done = jobs.filter((j) => j.status !== "cancelled").length;
  const owed = wallet?.commissionOwed ?? 0;

  if (loading || !user) {
    return (
      <AppShell>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Earnings & history" subtitle="Your wallet and completed jobs." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat icon="wallet" label="Net earnings" value={formatPKR(wallet?.netEarnings ?? 0)} />
        <Stat icon="check" label="Jobs completed" value={done} />
        <Stat
          icon="trend"
          label={`Owed to ${BRAND.name}`}
          value={formatPKR(owed)}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {owed > 0 && (
        <Card className="mt-4 bg-warning-light">
          <p className="text-sm font-semibold text-warning-foreground">
            {formatPKR(owed)} commission to settle
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            From cash you collected directly. Settle with the {BRAND.name} team.
          </p>
        </Card>
      )}

      <h2 className="mt-8 mb-4 text-xl font-bold tracking-tight">Past jobs</h2>

      {fetching ? (
        <Spinner />
      ) : jobs.length === 0 ? (
        <EmptyState icon="calendar" title="No completed jobs yet" hint="Accepted jobs land here once paid.">
          <LinkButton href="/pro/dashboard" size="sm">
            Find jobs
          </LinkButton>
        </EmptyState>
      ) : (
        <Card padded={false} className="overflow-hidden">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/pro/jobs/view/?id=${job.id}`}
              className="flex items-center justify-between gap-3 border-b border-border p-4 last:border-b-0 hover:bg-secondary"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{job.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(job.updated_at).toLocaleDateString("en-PK")} · {job.address}
                </p>
              </div>
              <div className="whitespace-nowrap text-right">
                <Pill tone={job.status === "cancelled" ? "bad" : "ok"}>
                  {JOB_STATUS_LABEL[job.status]}
                </Pill>
                <p className="mt-1 font-semibold">{formatPKR(job.price)}</p>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
