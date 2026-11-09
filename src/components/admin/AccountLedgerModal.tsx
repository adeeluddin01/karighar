"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";
import { Button, Card, EmptyState, KV, Pill, Spinner, formatPKR } from "@/components/ui";
import { summarizeLedger, type LedgerEntry, type LedgerSummary } from "@/lib/money";

/* ============================================================
   One account's whole money history, line by line.

   The settlements screen shows four totals per account and a Record button.
   When those totals disagree with `payments` — as the reconciliation banner
   can report — there was no way to find out WHICH job was wrong without
   opening the SQL editor. This is that view.

   It deliberately shows both sides next to each other: the ledger lines
   Karighar bills from, and the `payments` row the job actually produced. A
   job where those two disagree is the thing worth finding, so it is called
   out rather than left for the reader to spot by subtracting columns.
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

/** One job's lines, with the payment row they are supposed to mirror. */
type JobGroup = {
  jobId: string | null;
  /** Ledger lines whose job was deleted out from under them. */
  orphaned: boolean;
  title: string;
  jobStatus: string | null;
  when: string;
  lines: LedgerRow[];
  /** |commission| − adjustments, i.e. what this job contributes to the books. */
  ledgerCommission: number;
  /** The payment row's commission, or null when there is no payment row. */
  paymentCommission: number | null;
  paymentStatus: string | null;
  /** Non-zero when the two sides disagree — the thing worth finding. */
  drift: number;
};

const TYPE_LABEL: Record<string, string> = {
  earning: "Earned",
  commission: "Commission raised",
  payout: "Settled in cash",
  adjustment: "Reversed",
  business_share: "Business share",
};

export function AccountLedgerModal({
  accountId,
  name,
  onClose,
}: {
  accountId: string;
  name: string;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<JobGroup[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: led } = await supabase
      .from("provider_ledger")
      .select("id,job_id,type,amount,created_at")
      .eq("provider_id", accountId)
      .order("created_at", { ascending: false });
    const lines = (led as LedgerRow[]) || [];

    const jobIds = [...new Set(lines.map((l) => l.job_id).filter((x): x is string => !!x))];
    const [{ data: jobs }, { data: pays }] = await Promise.all([
      jobIds.length
        ? supabase.from("jobs").select("id,title,price,status").in("id", jobIds)
        : Promise.resolve({ data: [] }),
      jobIds.length
        ? supabase.from("payments").select("job_id,commission,amount,status").in("job_id", jobIds)
        : Promise.resolve({ data: [] }),
    ]);
    const jobById = new Map((((jobs as JobRow[]) || [])).map((j) => [j.id, j]));
    const payByJob = new Map((((pays as PaymentRow[]) || [])).map((p) => [p.job_id, p]));

    // Three buckets, not two. A null job_id means one of two very different
    // things and they must not share a row:
    //
    //   type 'payout'  — a cash settlement, which is SUPPOSED to have no job.
    //   anything else  — an orphan. provider_ledger.job_id is `on delete set
    //                    null` while payments.job_id is `on delete cascade`,
    //                    so deleting a job (or a customer, which cascades to
    //                    their jobs) destroys the payment and leaves these
    //                    behind. They are still billed by
    //                    commission_outstanding() and still counted by the
    //                    reconciliation, which is how a delta appears with
    //                    no job to blame it on.
    //
    // Lumping orphans in with settlements would have hidden exactly the bug
    // this screen exists to find.
    const byJob = new Map<string, LedgerRow[]>();
    for (const l of lines) {
      const key = l.job_id ?? (l.type === "payout" ? "__settlements__" : "__orphaned__");
      byJob.set(key, [...(byJob.get(key) ?? []), l]);
    }

    const out: JobGroup[] = [...byJob.entries()].map(([key, ls]) => {
      const orphaned = key === "__orphaned__";
      const jobId = key.startsWith("__") ? null : key;
      const job = jobId ? jobById.get(jobId) : undefined;
      const pay = jobId ? payByJob.get(jobId) : undefined;

      // Same arithmetic as admin_reconciliation(), per job instead of overall.
      const ledgerCommission =
        ls.filter((l) => l.type === "commission").reduce((s, l) => s + Math.abs(l.amount), 0) -
        ls.filter((l) => l.type === "adjustment").reduce((s, l) => s + l.amount, 0);
      // A refunded payment contributes nothing, exactly as the banner counts it.
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
            : "Account settlements",
        jobStatus: job?.status ?? null,
        when: ls[0]?.created_at ?? "",
        lines: ls,
        ledgerCommission,
        paymentCommission,
        paymentStatus: pay?.status ?? null,
        // A real settlement has no payment row to mirror, so it is never
        // drift. An orphan is ALL drift: nothing is left to reconcile it
        // against, and it is still being billed.
        drift: orphaned ? ledgerCommission : jobId ? ledgerCommission - (paymentCommission ?? 0) : 0,
      };
    });

    out.sort((a, b) => (a.when < b.when ? 1 : -1));
    setGroups(out);
    setSummary(summarizeLedger(lines.map((l) => ({ type: l.type, amount: l.amount }))));
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const drifting = groups.filter((g) => Math.abs(g.drift) > 0.005);
  const totalDrift = drifting.reduce((s, g) => s + g.drift, 0);

  return (
    <Modal title={name} subtitle="Payment history" onClose={onClose} size="lg">
      {loading ? (
        <Spinner label="Loading history…" />
      ) : (
        <div className="flex flex-col gap-4">
          {summary && (
            <div className="max-w-sm">
              <KV label="Net earned">{formatPKR(summary.netEarnings)}</KV>
              <KV label="Commission raised">{formatPKR(summary.commissionGross)}</KV>
              <KV label="Cash settled">{formatPKR(summary.cashSettled)}</KV>
              {summary.cancelled > 0 && (
                <KV label="Reversed">{formatPKR(summary.cancelled)}</KV>
              )}
              <KV label="Still owed">{formatPKR(summary.commissionOwed)}</KV>
            </div>
          )}

          {drifting.length > 0 && (
            <Card className="bg-warning-light">
              <p className="text-sm font-semibold text-warning-foreground">
                {drifting.length} job{drifting.length === 1 ? "" : "s"} where the ledger and the
                payment row disagree — {formatPKR(Math.abs(totalDrift))}{" "}
                {totalDrift > 0 ? "over" : "under"}-counted here.
              </p>
              <p className="mt-1 text-xs text-warning-foreground">
                This account&apos;s balance is billed from the ledger, so these jobs move what it
                is asked to pay. Marked below.
              </p>
            </Card>
          )}

          {groups.length === 0 ? (
            <EmptyState icon="wallet" title="Nothing yet" hint="Lines appear once a job is paid." />
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <div
                  key={g.jobId ?? "account"}
                  className="rounded-xl border border-border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{g.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.when ? new Date(g.when).toLocaleString("en-GB") : "—"}
                        {g.jobStatus ? ` · ${g.jobStatus}` : ""}
                        {g.paymentStatus ? ` · payment ${g.paymentStatus}` : ""}
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
                      <li
                        key={l.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {TYPE_LABEL[l.type] ?? l.type}
                        </span>
                        <span className={l.amount < 0 ? "font-semibold text-destructive" : "font-semibold"}>
                          {formatPKR(l.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {g.orphaned && (
                    <p className="mt-2 border-t border-border pt-2 text-xs text-warning-foreground">
                      The job these belong to no longer exists, so its payment row was deleted
                      with it — but these lines survived and are still being billed. Nothing can
                      reconcile them.
                    </p>
                  )}

                  {g.jobId && (
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
                            {g.lines.filter((l) => l.type === "commission").length} commission
                            lines on one job
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
