"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { BusinessShell } from "@/components/BusinessShell";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Input,
  LinkButton,
  Pill,
  Spinner,
  Stat,
  formatPKR,
} from "@/components/ui";
import { summarizeLedger, type LedgerEntry, type LedgerSummary } from "@/lib/money";
import { JOB_STATUS_LABEL, type BusinessMember, type Job, type Profile } from "@/lib/types";
import { BRAND } from "@/lib/config";

/** One technician's outstanding balance with this business. */
type Owing = { id: string; name: string | null; balance: number };

export default function BusinessEarnings() {
  const { user, loading } = useRequireAuth("/business/earnings");
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [wallet, setWallet] = useState<LedgerSummary | null>(null);
  const [owing, setOwing] = useState<Owing[]>([]);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const [{ data: jobRows }, { data: ledger }, { data: members }] = await Promise.all([
      supabase
        .from("jobs")
        .select("*")
        .eq("business_id", user.id)
        .in("status", ["paid", "rated", "cancelled"])
        .order("updated_at", { ascending: false }),
      // `ledger_self` matches on provider_id, which for a business means
      // "the account this line belongs to" — the column was widened to
      // profiles(id) precisely so a dispatcher can hold one.
      supabase.from("provider_ledger").select("type,amount").eq("provider_id", user.id),
      supabase.from("business_members").select("*").eq("business_id", user.id),
    ]);
    setJobs((jobRows as Job[]) || []);
    setWallet(summarizeLedger((ledger as LedgerEntry[]) || []));

    // Per-technician balances. ledger_self lets a business read its members'
    // `business_share` rows specifically — both the debts jobs_on_paid raises
    // and the credits business_settle_with_tech writes — so this nets out to
    // what each of them still actually owes.
    const roster = (members as BusinessMember[]) || [];
    const ids = [...new Set(roster.map((m) => m.provider_id))];
    if (ids.length) {
      const [{ data: techLedger }, { data: profiles }] = await Promise.all([
        supabase
          .from("provider_ledger")
          .select("provider_id,amount")
          .eq("type", "business_share")
          .in("provider_id", ids),
        supabase.from("profiles").select("id,full_name").in("id", ids),
      ]);
      const byId = new Map(((profiles as Profile[]) || []).map((p) => [p.id, p.full_name]));
      const sums = new Map<string, number>();
      for (const r of (techLedger as { provider_id: string; amount: number }[]) || []) {
        sums.set(r.provider_id, (sums.get(r.provider_id) ?? 0) + Number(r.amount));
      }
      setOwing(
        ids
          // Stored negative on the technician (money they hold that is ours).
          .map((id) => ({
            id,
            name: byId.get(id) ?? null,
            balance: Math.round(-(sums.get(id) ?? 0) * 100) / 100,
          }))
          .filter((o) => o.balance > 0)
          .sort((a, b) => b.balance - a.balance)
      );
    } else {
      setOwing([]);
    }
    setFetching(false);
  }, [user]);

  useEffect(() => {
    // Wrapped so nothing in load() runs synchronously in the effect body —
    // every setState in it is behind an await. Same shape as /pro/history.
    void (async () => {
      await load();
    })();
  }, [load]);

  async function settle(o: Owing) {
    const raw = amounts[o.id] ?? String(o.balance);
    const amount = Number(raw);
    if (!raw.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setBusy(o.id);
    const { error } = await createClient().rpc("business_settle_with_tech", {
      p_provider: o.id,
      p_amount: amount,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    // Drop the typed-in amount so the box falls back to the new balance.
    setAmounts((cur) => {
      const next = { ...cur };
      delete next[o.id];
      return next;
    });
    toast(`Recorded ${formatPKR(amount)} from ${o.name ?? "your technician"}.`, "success");
    await load();
  }

  if (loading || fetching) {
    return (
      <BusinessShell>
        <Spinner label="Loading…" />
      </BusinessShell>
    );
  }

  const owed = wallet?.commissionOwed ?? 0;
  const receivable = wallet?.businessShareNet ?? 0;
  const done = jobs.filter((j) => j.status !== "cancelled").length;

  return (
    <BusinessShell>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* In the COD model the technician physically collects the cash, so
            the business's side of a job is a receivable from them, not money
            it already holds. Labelling it "earnings" would misstate that.
            It nets down as settlements are recorded below. */}
        <Stat icon="wallet" label="Due from your team" value={formatPKR(receivable)} />
        <Stat icon="check" label="Jobs paid" value={done} />
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
            {BRAND.name} bills the business, not your technicians. Collect their share below,
            then settle {formatPKR(owed)} with the {BRAND.name} team.
          </p>
        </Card>
      )}

      {owing.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-xl font-bold tracking-tight">Cash held by your team</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Your share of jobs they were paid for in cash. Record a payment when they hand it
            over — both sides&apos; balances move together.
          </p>
          <div className="flex flex-col gap-4">
            {owing.map((o) => (
              <Card key={o.id}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={o.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{o.name ?? "Unnamed"}</p>
                      <p className="text-sm text-muted-foreground">
                        owes {formatPKR(o.balance)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={amounts[o.id] ?? String(o.balance)}
                      onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })}
                      aria-label={`Amount received from ${o.name ?? "this technician"}`}
                      prefix="Rs"
                      className="w-36"
                    />
                    <Button size="sm" disabled={busy === o.id} onClick={() => settle(o)}>
                      Received
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <h2 className="mt-8 mb-4 text-xl font-bold tracking-tight">Dispatched jobs</h2>

      {jobs.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No finished jobs yet"
          hint="Jobs you assign land here once they're paid."
        >
          <LinkButton href="/business" size="sm">
            Open the board
          </LinkButton>
        </EmptyState>
      ) : (
        <Card padded={false} className="overflow-hidden">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between gap-3 border-b border-border p-4 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{job.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(job.updated_at).toLocaleDateString("en-PK")} · {job.address}
                  {job.tech_share !== null && ` · tech kept ${Math.round(job.tech_share * 100)}%`}
                </p>
              </div>
              <div className="whitespace-nowrap text-right">
                <Pill tone={job.status === "cancelled" ? "bad" : "ok"}>
                  {JOB_STATUS_LABEL[job.status]}
                </Pill>
                <p className="mt-1 font-semibold">{formatPKR(job.price)}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </BusinessShell>
  );
}
