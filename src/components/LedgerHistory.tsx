"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, KV, Pill, Spinner, formatPKR } from "@/components/ui";
import { InfoTip } from "@/components/InfoTip";
import { summarizeLedger, type LedgerEntry, type LedgerSummary } from "@/lib/money";
import { BRAND } from "@/lib/config";

/* ============================================================
   One account's money, job by job.

   Shared by three screens with the same question and different authority:

     /admin/settlements   any account, plus the bookkeeping diagnostics
     /pro/history         the technician's own statement
     /business/earnings   the company's own statement

   RLS decides what comes back, not this component — `ledger_self` already
   admits `provider_id = auth.uid()`, the admin, and a business reading the
   jobs it dispatched. Passing someone else's id as a non-admin simply
   returns nothing, so the same query is safe on all three.

   `variant="admin"` adds the reconciliation diagnostics: whether each job's
   ledger lines agree with its `payments` row, and whether any lines have
   been orphaned by a deleted job. A technician has no use for either — they
   cannot act on a bookkeeping mismatch — so their view stays a plain
   statement.
   ============================================================ */

type LedgerRow = {
  id: string;
  job_id: string | null;
  type: LedgerEntry["type"];
  amount: number;
  created_at: string;
};

type JobRow = { id: string; title: string; price: number | null; status: string };
type PaymentRow = { job_id: string; commission: number; amount: number; status: string };

type Group = {
  jobId: string | null;
  orphaned: boolean;
  title: string;
  jobStatus: string | null;
  when: string;
  lines: LedgerRow[];
  ledgerCommission: number;
  paymentCommission: number | null;
  paymentStatus: string | null;
  drift: number;
};

const TYPE_LABEL: Record<string, string> = {
  earning: "Earned",
  commission: `${BRAND.name} commission`,
  payout: "Settled in cash",
  adjustment: "Reversed",
  business_share: "Business share",
};

const TYPE_TIP: Record<string, string> = {
  earning: "Your share of the cash collected on this job.",
  commission: `What ${BRAND.name} charges on this job. You collected the cash, so this is owed back to us.`,
  payout: `Cash you have handed to ${BRAND.name}. It reduces what you owe, and never changes what was billed.`,
  adjustment: "This job was reversed, cancelling the commission that had been raised on it.",
  business_share: "The company's share of the cash collected on a job they dispatched.",
};

export function LedgerHistory({
  accountId,
  variant = "self",
}: {
  accountId: string;
  variant?: "self" | "admin";
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: led, error } = await supabase
      .from("provider_ledger")
      .select("id,job_id,type,amount,created_at")
      .eq("provider_id", accountId)
      .order("created_at", { ascending: false });
    if (error) {
      setFailed(true);
      setLoading(false);
      return;
    }
    const lines = (led as LedgerRow[]) || [];

    const jobIds = [...new Set(lines.map((l) => l.job_id).filter((x): x is string => !!x))];
    const [{ data: jobs }, { data: pays }] = await Promise.all([
      jobIds.length
        ? supabase.from("jobs").select("id,title,price,status").in("id", jobIds)
        : Promise.resolve({ data: [] }),
      // Only the admin view compares against payments, and only an admin or a
      // job participant can read them anyway.
      variant === "admin" && jobIds.length
        ? supabase.from("payments").select("job_id,commission,amount,status").in("job_id", jobIds)
        : Promise.resolve({ data: [] }),
    ]);
    const jobById = new Map((((jobs as JobRow[]) || [])).map((j) => [j.id, j]));
    const payByJob = new Map((((pays as PaymentRow[]) || [])).map((p) => [p.job_id, p]));

    // Three buckets. A null job_id means one of two very different things:
    //   'payout'      a cash settlement, which correctly has no job.
    //   anything else an orphan — provider_ledger.job_id was `on delete set
    //                 null` while payments.job_id cascaded, so deleting a job
    //                 destroyed the payment and left these behind, still
    //                 billed and impossible to reconcile. patch_v30 makes the
    //                 ledger cascade too, but historic rows can still exist.
    const byKey = new Map<string, LedgerRow[]>();
    for (const l of lines) {
      const key = l.job_id ?? (l.type === "payout" ? "__settlements__" : "__orphaned__");
      byKey.set(key, [...(byKey.get(key) ?? []), l]);
    }

    const out: Group[] = [...byKey.entries()].map(([key, ls]) => {
      const orphaned = key === "__orphaned__";
      const jobId = key.startsWith("__") ? null : key;
      const job = jobId ? jobById.get(jobId) : undefined;
      const pay = jobId ? payByJob.get(jobId) : undefined;

      // The same arithmetic admin_reconciliation() runs overall, per job.
      const ledgerCommission =
        ls.filter((l) => l.type === "commission").reduce((s, l) => s + Math.abs(l.amount), 0) -
        ls.filter((l) => l.type === "adjustment").reduce((s, l) => s + l.amount, 0);
      const paymentCommission = pay
        ? pay.status === "refunded"
          ? 0
          : Number(pay.commission)
        : null;

      return {
        jobId,
        orphaned,
        title: jobId
          ? (job?.title ?? "Job no longer on file")
          : orphaned
            ? "Orphaned — the job behind these was deleted"
            : "Settled in cash",
        jobStatus: job?.status ?? null,
        when: ls[0]?.created_at ?? "",
        lines: ls,
        ledgerCommission,
        paymentCommission,
        paymentStatus: pay?.status ?? null,
        drift:
          variant !== "admin"
            ? 0
            : orphaned
              ? ledgerCommission
              : jobId
                ? ledgerCommission - (paymentCommission ?? 0)
                : 0,
      };
    });

    out.sort((a, b) => (a.when < b.when ? 1 : -1));
    setGroups(out);
    setSummary(summarizeLedger(lines.map((l) => ({ type: l.type, amount: l.amount }))));
    setLoading(false);
  }, [accountId, variant]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const drifting = groups.filter((g) => Math.abs(g.drift) > 0.005);
  const totalDrift = drifting.reduce((s, g) => s + g.drift, 0);

  if (loading) return <Spinner label="Loading history…" />;
  if (failed) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load your statement. Try reloading.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <div className="max-w-sm">
          <KV
            label={
              <span className="flex items-center">
                Net earned
                <InfoTip label="About net earned">
                  Your share of the cash collected across every paid job, before anything is
                  settled.
                </InfoTip>
              </span>
            }
          >
            {formatPKR(summary.netEarnings)}
          </KV>
          <KV
            label={
              <span className="flex items-center">
                Commission raised
                <InfoTip label="About commission raised">
                  The total {BRAND.name} has charged across all your paid jobs, ever. It never goes
                  down when you settle — settling reduces what you still owe, not what was billed.
                </InfoTip>
              </span>
            }
          >
            {formatPKR(summary.commissionGross)}
          </KV>
          <KV
            label={
              <span className="flex items-center">
                Cash settled
                <InfoTip label="About cash settled">
                  What you have handed over so far, recorded by the {BRAND.name} team.
                </InfoTip>
              </span>
            }
          >
            {formatPKR(summary.cashSettled)}
          </KV>
          {summary.cancelled > 0 && (
            <KV
              label={
                <span className="flex items-center">
                  Reversed
                  <InfoTip label="About reversed">
                    Commission cancelled because a job was refunded or reversed. Not cash — it is
                    debt written off.
                  </InfoTip>
                </span>
              }
            >
              {formatPKR(summary.cancelled)}
            </KV>
          )}
          <KV
            label={
              <span className="flex items-center">
                Still owed
                <InfoTip label="About still owed">
                  Commission raised, minus what you have settled and anything reversed. This is the
                  figure to clear.
                </InfoTip>
              </span>
            }
          >
            {formatPKR(summary.commissionOwed)}
          </KV>
        </div>
      )}

      {variant === "admin" && drifting.length > 0 && (
        <Card className="bg-warning-light">
          <p className="text-sm font-semibold text-warning-foreground">
            {drifting.length} job{drifting.length === 1 ? "" : "s"} where the ledger and the payment
            row disagree — {formatPKR(Math.abs(totalDrift))}{" "}
            {totalDrift > 0 ? "over" : "under"}-counted here.
          </p>
          <p className="mt-1 text-xs text-warning-foreground">
            This account is billed from the ledger, so these move what it is asked to pay. Marked
            below.
          </p>
        </Card>
      )}

      {groups.length === 0 ? (
        <EmptyState icon="wallet" title="Nothing yet" hint="Lines appear once a job is paid." />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.jobId ?? g.title} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{g.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.when ? new Date(g.when).toLocaleString("en-GB") : "—"}
                    {g.jobStatus ? ` · ${g.jobStatus}` : ""}
                    {variant === "admin" && g.paymentStatus ? ` · payment ${g.paymentStatus}` : ""}
                  </p>
                </div>
                {Math.abs(g.drift) > 0.005 && (
                  <Pill tone="bad">
                    {formatPKR(Math.abs(g.drift))} {g.drift > 0 ? "over" : "under"}
                  </Pill>
                )}
              </div>

              <ul className="mt-2 flex flex-col gap-1">
                {g.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center text-muted-foreground">
                      {TYPE_LABEL[l.type] ?? l.type}
                      {TYPE_TIP[l.type] && (
                        <InfoTip label={`About ${TYPE_LABEL[l.type] ?? l.type}`}>
                          {TYPE_TIP[l.type]}
                        </InfoTip>
                      )}
                    </span>
                    <span
                      className={l.amount < 0 ? "font-semibold text-destructive" : "font-semibold"}
                    >
                      {formatPKR(l.amount)}
                    </span>
                  </li>
                ))}
              </ul>

              {g.orphaned && (
                <p className="mt-2 border-t border-border pt-2 text-xs text-warning-foreground">
                  The job these belong to no longer exists, so its payment row was deleted with it —
                  but these lines survived and are still being billed. Nothing can reconcile them.
                </p>
              )}

              {variant === "admin" && g.jobId && (
                <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                  Ledger commission {formatPKR(g.ledgerCommission)} ·{" "}
                  {g.paymentCommission === null
                    ? "no payment row"
                    : `payment row ${formatPKR(g.paymentCommission)}`}
                  {g.lines.filter((l) => l.type === "commission").length > 1 && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="font-semibold text-destructive">
                        {g.lines.filter((l) => l.type === "commission").length} commission lines on
                        one job
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
