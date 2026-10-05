"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { Avatar, Button, Card, EmptyState, Pill, Rating } from "@/components/ui";
import type { Provider, ProviderStatus, Profile } from "@/lib/types";

type Row = Provider & { profile?: Profile };

const TONE: Record<ProviderStatus, "warn" | "ok" | "bad" | "gray"> = {
  pending: "warn",
  approved: "ok",
  rejected: "bad",
  suspended: "gray",
};

export default function AdminProviders() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: provs } = await supabase
      .from("providers")
      .select("*")
      .order("verified_at", { nullsFirst: true });
    const list = (provs as Provider[]) || [];
    const ids = list.map((p) => p.profile_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("*").in("id", ids)
      : { data: [] };
    setRows(
      list.map((p) => ({ ...p, profile: (profs as Profile[])?.find((x) => x.id === p.profile_id) }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: ProviderStatus) {
    setBusy(id);
    await createClient()
      .from("providers")
      .update({ status, verified_at: status === "approved" ? new Date().toISOString() : null })
      .eq("profile_id", id);
    await load();
    setBusy(null);
  }

  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  return (
    <AdminShell>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Awaiting verification</h2>
          <Pill tone={pending.length ? "warn" : "ok"}>{pending.length}</Pill>
        </div>
        {pending.length === 0 ? (
          <EmptyState icon="party" title="Nothing pending" hint="Every provider has been reviewed." />
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map((r) => (
              <ProviderCard
                key={r.profile_id}
                r={r}
                busy={busy === r.profile_id}
                onSet={setStatus}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">All providers</h2>
          <span className="text-xs text-muted-foreground">{others.length} total</span>
        </div>
        {others.length === 0 ? (
          <EmptyState icon="users" title="No providers yet" />
        ) : (
          <div className="flex flex-col gap-4">
            {others.map((r) => (
              <ProviderCard
                key={r.profile_id}
                r={r}
                busy={busy === r.profile_id}
                onSet={setStatus}
              />
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}

function ProviderCard({
  r,
  busy,
  onSet,
}: {
  r: Row;
  busy: boolean;
  onSet: (id: string, s: ProviderStatus) => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={r.profile?.full_name} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold">{r.profile?.full_name ?? "Unnamed"}</h3>
              <Pill tone={TONE[r.status]}>{r.status}</Pill>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.profile?.phone ?? "no phone"} · CNIC {r.cnic_no ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Rating value={r.rating_avg} /> · {r.jobs_completed} jobs · Areas:{" "}
              {r.service_areas?.length ? r.service_areas.join(", ") : "—"}
            </p>
            {r.bio && <p className="mt-2 text-sm">{r.bio}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status !== "approved" && (
            <Button size="sm" disabled={busy} onClick={() => onSet(r.profile_id, "approved")}>
              Approve
            </Button>
          )}
          {r.status === "pending" && (
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => onSet(r.profile_id, "rejected")}
            >
              Reject
            </Button>
          )}
          {r.status === "approved" && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onSet(r.profile_id, "suspended")}
            >
              Suspend
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
