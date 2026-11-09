"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import {
  Button,
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
import { InfoTip } from "@/components/InfoTip";
import { JOB_STATUS_LABEL, type Job } from "@/lib/types";
import { BRAND } from "@/lib/config";

export default function ProviderHistoryPage() {
  const { user, profile, loading } = useRequireAuth("/pro/history");
  const router = useRouter();

  // Pro-area page: a signed-in non-provider opening the URL directly gets
  // their own home, not an empty history. Pending providers pass — the
  // check is profile.role, not approval status.
  useEffect(() => {
    if (!loading && profile && profile.role !== "provider") {
      router.replace(
        profile.role === "customer" ? "/" : profile.role === "business" ? "/business" : "/admin",
      );
    }
  }, [loading, profile, router]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [wallet, setWallet] = useState<LedgerSummary | null>(null);
  const [walletError, setWalletError] = useState(false);
  const [fetching, setFetching] = useState(true);
  // Same never-stuck guarantee as the job view and dashboard.
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      setLoadError(false);
      try {
      const [{ data: jobRows }, ledger] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("provider_id", user.id)
          .in("status", ["paid", "rated", "cancelled"])
          .order("updated_at", { ascending: false }),
        supabase.from("provider_ledger").select("type,amount").eq("provider_id", user.id),
      ]);
      setJobs((jobRows as Job[]) || []);
      // A failed ledger read used to default silently to Rs 0 — a
      // pro who genuinely owed money would have seen a clean zero.
      if (ledger.error) {
        setWalletError(true);
        setWallet(null);
      } else {
        setWalletError(false);
        setWallet(summarizeLedger((ledger.data as LedgerEntry[]) || []));
      }
      } catch {
        setLoadError(true);
      } finally {
        setFetching(false);
      }
    })();
  }, [user]);

  if (!loading && profile && profile.role !== "provider") return null;

  const done = jobs.filter((j) => j.status !== "cancelled").length;
  const owed = wallet?.commissionOwed ?? 0;
  // Negative on a technician: cash they collected that belongs to their
  // business. Separate from `owed`, which is always Karighar's.
  const dueToBusiness = Math.abs(Math.min(0, wallet?.businessShareNet ?? 0));

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
        <Stat
          icon="wallet"
          label={
            <span className="flex items-center">
              Net earnings
              <InfoTip label="About net earnings">
                Your share of the cash collected across every paid job, before anything is settled
                with {BRAND.name}.
              </InfoTip>
            </span>
          }
          value={formatPKR(wallet?.netEarnings ?? 0)}
        />
        <Stat icon="check" label="Jobs completed" value={done} />
        {/* Two different debts, deliberately never added together: Karighar's
            commission on your own jobs, and your business's share of the cash
            you collected on theirs. An attached technician owes Karighar
            nothing on dispatched work — the business is billed for that. */}
        {/* Both figures, side by side, never either/or: a technician can
            hold business cash and owe Karighar commission at the same time
            (on different jobs), and the old slot hid one of them. */}
        <Stat
          icon="trend"
          label={
            <span className="flex items-center">
              {`Owed to ${BRAND.name}`}
              <InfoTip label={`About what you owe ${BRAND.name}`}>
                Commission on jobs you took yourself and collected cash for, minus what you have
                already settled. It does not include work your business sent you — {BRAND.name}
                bills them for that.
              </InfoTip>
            </span>
          }
          value={walletError ? "—" : formatPKR(owed)}
        />
        {dueToBusiness > 0 && (
          <Stat
            icon="users"
            label={
              <span className="flex items-center">
                Due to your business
                <InfoTip label="About what you owe your business">
                  Their share of cash you collected on jobs they dispatched. Separate from the
                  {" "}{BRAND.name} figure, and never added to it — the two are owed to different
                  people.
                </InfoTip>
              </span>
            }
            value={formatPKR(dueToBusiness)}
          />
        )}
      </div>

      {walletError && (
        <p className="mt-3 text-xs text-destructive">
          Couldn&apos;t load your wallet — the figures above may be incomplete. Try reloading.
        </p>
      )}

      {owed > 0 && (
        <Card className="mt-4 bg-warning-light">
          <p className="text-sm font-semibold text-warning-foreground">
            {formatPKR(owed)} commission to settle
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            From cash you collected directly on your own jobs. Settle with the {BRAND.name} team.
          </p>
        </Card>
      )}

      {dueToBusiness > 0 && (
        <Card className="mt-4">
          <p className="text-sm font-semibold">{formatPKR(dueToBusiness)} due to your business</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Their share of the cash you collected on jobs they sent you. {BRAND.name} bills them,
            not you — you owe us nothing on that work. This figure drops as they record what
            you hand over.
          </p>
        </Card>
      )}

      {/* The statement itself lives on its own screen now. It was a card
          here, between the totals and the job list, and a ledger has no
          natural length — on a busy account it buried both. */}
      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold">
              Your statement
              <InfoTip label="About your statement">
                Every line {BRAND.name} has recorded against your account: what you earned on each
                job, the commission raised on it, and any cash you have settled. Filter it by date
                on that screen.
              </InfoTip>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Line by line, filterable by date.
            </p>
          </div>
          <LinkButton href="/pro/statement" size="sm" icon="file">
            Open statement
          </LinkButton>
        </div>
      </Card>

      <h2 className="mt-8 mb-4 text-xl font-bold tracking-tight">Past jobs</h2>

      {loadError ? (
        <Card className="text-center">
          <p className="text-muted-foreground">
            Couldn&apos;t load your history — check your connection and try again.
          </p>
          <Button
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </Card>
      ) : fetching ? (
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
              <div className="whitespace-nowrap text-end">
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
