"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Input, Pill } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Dispute = {
  id: string;
  job_id: string;
  raised_by: string;
  reason: string;
  status: string;
  resolution: string | null;
  created_at: string;
};
type Row = Dispute & { jobTitle?: string; raiser?: string };

export default function AdminDisputes() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: disputes } = await supabase
      .from("disputes")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (disputes as Dispute[]) || [];
    const jobIds = [...new Set(list.map((d) => d.job_id))];
    const userIds = [...new Set(list.map((d) => d.raised_by))];
    const [{ data: jobs }, { data: profs }] = await Promise.all([
      jobIds.length
        ? supabase.from("jobs").select("id,title").in("id", jobIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase.from("profiles").select("id,full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
    ]);
    setRows(
      list.map((d) => ({
        ...d,
        jobTitle: (jobs as { id: string; title: string }[])?.find((j) => j.id === d.job_id)?.title,
        raiser: (profs as { id: string; full_name: string }[])?.find((p) => p.id === d.raised_by)
          ?.full_name,
      }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(row: Row) {
    setBusy(row.id);
    const { error } = await createClient()
      .from("disputes")
      .update({ status: "resolved", resolution: notes[row.id] ?? "Resolved" })
      .eq("id", row.id);
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Dispute resolved", "success");
    await load();
  }

  const open = rows.filter((r) => r.status !== "resolved");
  const resolved = rows.filter((r) => r.status === "resolved");

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Open disputes</h2>
        <Pill tone={open.length ? "bad" : "ok"}>{open.length}</Pill>
      </div>

      {open.length === 0 ? (
        <EmptyState icon="party" title="No open disputes" hint="Everything reported has been handled." />
      ) : (
        <div className="flex flex-col gap-4">
          {open.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href="/admin/jobs" className="font-bold hover:text-primary">
                    {d.jobTitle ?? "Job"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    by {d.raiser ?? "user"} · {new Date(d.created_at).toLocaleString("en-PK")}
                  </p>
                  <p className="mt-2 text-sm">{d.reason}</p>
                </div>
                <Pill tone="warn">{d.status}</Pill>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Input
                  className="flex-1"
                  placeholder="Resolution note…"
                  value={notes[d.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                  aria-label="Resolution note"
                />
                <Button size="sm" disabled={busy === d.id} onClick={() => resolve(d)}>
                  Resolve
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <>
          <div className="mt-10 mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Resolved</h2>
            <span className="text-xs text-muted-foreground">{resolved.length} total</span>
          </div>
          <Card padded={false} className="overflow-hidden">
            {resolved.map((d) => (
              <div key={d.id} className="border-b border-border p-4 last:border-b-0">
                <p className="font-semibold">{d.jobTitle ?? "Job"}</p>
                <p className="text-sm text-muted-foreground">{d.reason}</p>
                {d.resolution && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-success">
                    <Icon name="check" size="sm" /> {d.resolution}
                  </p>
                )}
              </div>
            ))}
          </Card>
        </>
      )}
    </AdminShell>
  );
}
