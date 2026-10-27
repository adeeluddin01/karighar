"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, EmptyState, Input, KV, Stat, formatPKR } from "@/components/ui";
import { summarizeLedger, type LedgerEntry, type LedgerSummary } from "@/lib/money";
import type { Profile } from "@/lib/types";
import { clsx } from "@/lib/clsx";

type Row = { id: string; name: string; phone: string | null; summary: LedgerSummary };

type Recon = {
  paid_without_payment: number;
  duplicate_payments: number;
  payments_commission: number;
  ledger_commission: number;
  commission_delta: number;
  stranded_completed: number;
  stranded_value: number;
};

export default function AdminSettlements() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // P2-7: `payments` was write-only — nothing ever compared it to the ledger.
  const [recon, setRecon] = useState<Recon | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: ledger } = await supabase
      .from("provider_ledger")
      .select("provider_id,type,amount");
    const byProvider = new Map<string, LedgerEntry[]>();
    (
      (ledger as { provider_id: string; type: LedgerEntry["type"]; amount: number }[]) || []
    ).forEach((e) => {
      const list = byProvider.get(e.provider_id) ?? [];
      list.push({ type: e.type, amount: e.amount });
      byProvider.set(e.provider_id, list);
    });
    const ids = [...byProvider.keys()];
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("*").in("id", ids)
      : { data: [] };
    const result: Row[] = ids.map((id) => {
      const p = (profs as Profile[])?.find((x) => x.id === id);
      return {
        id,
        name: p?.full_name ?? "Pro",
        phone: p?.phone ?? null,
        summary: summarizeLedger(byProvider.get(id)!),
      };
    });
    result.sort((a, b) => b.summary.commissionOwed - a.summary.commissionOwed);
    setRows(result);
    const { data: rec } = await supabase.rpc("admin_reconciliation");
    setRecon(Array.isArray(rec) ? ((rec[0] as Recon) ?? null) : ((rec as Recon) ?? null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function settle(row: Row) {
    const raw = amounts[row.id];
    const amount = raw ? Number(raw) : row.summary.commissionOwed;
    if (!amount || amount <= 0) {
      toast("Enter a valid amount", "error");
      return;
    }
    setBusy(row.id);
    const { error } = await createClient().rpc("record_settlement", {
      p_provider: row.id,
      p_amount: amount,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(`Recorded ${formatPKR(amount)} settlement`, "success");
    setAmounts((a) => ({ ...a, [row.id]: "" }));
    await load();
  }

  const totalOwed = rows.reduce((s, r) => s + r.summary.commissionOwed, 0);
  const totalSettled = rows.reduce((s, r) => s + r.summary.settled, 0);

  return (
    <AdminShell>

      {recon && <Reconciliation r={recon} />}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat icon="wallet" label="Commission outstanding" value={formatPKR(totalOwed)} />
        <Stat icon="check" label="Settled to date" value={formatPKR(totalSettled)} />
        <Stat
          icon="users"
          label="Providers with a balance"
          value={rows.filter((r) => r.summary.commissionOwed > 0).length}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <h2 className="mt-8 mb-4 text-xl font-bold tracking-tight">Provider balances</h2>

      {rows.length === 0 ? (
        <EmptyState icon="wallet" title="No provider earnings yet" hint="Balances appear once jobs are paid." />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar name={r.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.phone ?? "—"}</p>
                    <div className="mt-2 max-w-xs">
                      <KV label="Net earned">{formatPKR(r.summary.netEarnings)}</KV>
                      <KV label="Commission gross">{formatPKR(r.summary.commissionGross)}</KV>
                      <KV label="Settled">{formatPKR(r.summary.settled)}</KV>
                    </div>
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Owed</p>
                    <p className="text-lg font-extrabold text-warning-foreground">
                      {formatPKR(r.summary.commissionOwed)}
                    </p>
                  </div>
                  <Input
                    className="w-32"
                    type="number"
                    inputMode="numeric"
                    prefix="Rs"
                    placeholder={String(r.summary.commissionOwed)}
                    value={amounts[r.id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                    aria-label={`Settlement amount for ${r.name}`}
                  />
                  <Button
                    size="sm"
                    disabled={busy === r.id || r.summary.commissionOwed <= 0}
                    onClick={() => settle(r)}
                  >
                    Record
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}


/**
 * Does the ledger agree with the payment record?
 *
 * Nothing asked this before — `payments` is written by jobs_on_paid and was
 * never read back, so a divergence (an admin override, a half-applied patch)
 * had nothing to surface it. A reversal books an 'adjustment' rather than a
 * negative 'commission', so both legs are netted before comparing.
 */
function Reconciliation({ r }: { r: Recon }) {
  const clean =
    r.paid_without_payment === 0 && r.duplicate_payments === 0 && Math.abs(r.commission_delta) < 0.01;
  return (
    <Card className={clsx("mb-6", clean ? "" : "bg-warning-light")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">
            {clean ? "Books reconcile" : "Books do not reconcile"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Commission recorded in <code>payments</code> against commission raised in the ledger,
            net of reversals.
          </p>
        </div>
        <span className={clsx("text-lg font-extrabold", clean ? "text-success" : "text-warning-foreground")}>
          {clean ? "✓" : formatPKR(r.commission_delta)}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KV label="In payments">{formatPKR(r.payments_commission)}</KV>
        <KV label="In ledger">{formatPKR(r.ledger_commission)}</KV>
        <KV label="Paid, no payment row">{r.paid_without_payment}</KV>
        <KV label="Duplicate payments">{r.duplicate_payments}</KV>
      </div>
      {r.stranded_completed > 0 && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <strong>{r.stranded_completed}</strong> job
          {r.stranded_completed === 1 ? " has" : "s have"} sat at <em>completed</em> for more than
          three days, worth {formatPKR(r.stranded_value)}. Commission is only raised on the move to
          paid, so nothing is owed on these yet.
        </p>
      )}
    </Card>
  );
}
