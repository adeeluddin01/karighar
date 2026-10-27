"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { Icon } from "@/components/Icon";
import { CommissionField } from "@/components/admin/CommissionField";
import { DefaultCommissionCard } from "@/components/admin/DefaultCommissionCard";
import {
  DEFAULT_COMMISSION,
  PLATFORM_RATE_COLUMNS,
  ratePairOf,
  type PlatformSettings,
  type RatePair,
} from "@/lib/commission";
import { Avatar, Button, Card, EmptyState, Input, Pill, Rating } from "@/components/ui";
import { fetchEmails, matchesQuery } from "@/lib/adminSearch";
import type { Provider, ProviderStatus, Profile } from "@/lib/types";

type Row = Provider & { profile?: Profile; email?: string };

const TONE: Record<ProviderStatus, "warn" | "ok" | "bad" | "gray"> = {
  pending: "warn",
  approved: "ok",
  rejected: "bad",
  suspended: "gray",
};

export default function AdminProviders() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The platform rates a TECHNICIAN with no override of its own follows.
  // Companies have their own pair, edited on the Businesses tab — saving
  // here never touches theirs. Falls back to the built-in numbers on a
  // database that hasn't run patch_v24.
  const [defaults, setDefaults] = useState<RatePair>(DEFAULT_COMMISSION.provider);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [noSettings, setNoSettings] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: settings, error: setErr } = await supabase
      .from("platform_settings")
      .select(PLATFORM_RATE_COLUMNS)
      .maybeSingle();
    const ps = (settings as PlatformSettings | null) ?? null;
    setNoSettings(!!setErr || !ps);
    setDefaults(ratePairOf(ps, "provider"));
    setUpdatedAt(ps?.updated_at ?? null);
    const { data: provs } = await supabase
      .from("providers")
      .select("*")
      .order("verified_at", { nullsFirst: true });
    const list = (provs as Provider[]) || [];
    const ids = list.map((p) => p.profile_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("*").in("id", ids)
      : { data: [] };
    // Emails come from auth.users via an admin-only RPC — they are not on
    // `profiles`, and support requests almost always quote the email.
    const emails = await fetchEmails(supabase, ids);
    setRows(
      list.map((p) => ({
        ...p,
        profile: (profs as Profile[])?.find((x) => x.id === p.profile_id),
        email: emails.get(p.profile_id),
      }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Patched in place rather than reloading: the rate is the only thing that
  // changed, and a reload would scroll a long list back to the top.
  function applyRate(id: string, rate: number | null) {
    setRows((rs) => rs.map((r) => (r.profile_id === id ? { ...r, commission_rate: rate } : r)));
  }

  async function setStatus(id: string, status: ProviderStatus) {
    setBusy(id);
    await createClient()
      .from("providers")
      .update({ status, verified_at: status === "approved" ? new Date().toISOString() : null })
      .eq("profile_id", id);
    await load();
    setBusy(null);
  }

  const found = rows.filter((r) =>
    matchesQuery(query, { name: r.profile?.full_name, phone: r.profile?.phone, email: r.email })
  );
  const pending = found.filter((r) => r.status === "pending");
  const others = found.filter((r) => r.status !== "pending");

  return (
    <AdminShell>
      <DefaultCommissionCard
        scope="provider"
        value={defaults}
        missing={noSettings}
        updatedAt={updatedAt}
        onSaved={setDefaults}
      />

      <Input
        className="mb-6 mt-8"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, email or phone"
        aria-label="Search providers"
        prefix={<Icon name="search" size="sm" />}
      />
      {query.trim() && (
        <p className="-mt-3 mb-6 text-xs text-muted-foreground">
          {found.length} of {rows.length} providers match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

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
                defaults={defaults}
                onRate={applyRate}
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
          <EmptyState
            icon={query.trim() ? "search" : "users"}
            title={query.trim() ? "No match" : "No providers yet"}
            hint={query.trim() ? "Try an email, a phone number, or part of a name." : undefined}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {others.map((r) => (
              <ProviderCard
                key={r.profile_id}
                r={r}
                busy={busy === r.profile_id}
                onSet={setStatus}
                defaults={defaults}
                onRate={applyRate}
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
  defaults,
  onRate,
}: {
  r: Row;
  busy: boolean;
  onSet: (id: string, s: ProviderStatus) => void;
  defaults: { fixed: number; custom: number };
  onRate: (id: string, rate: number | null) => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={r.profile?.full_name} src={r.profile?.avatar_url} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold">{r.profile?.full_name ?? "Unnamed"}</h3>
              <Pill tone={TONE[r.status]}>{r.status}</Pill>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.email ?? "no email"} · {r.profile?.phone ?? "no phone"} · CNIC{" "}
              {r.cnic_no ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Rating value={r.rating_avg} /> · {r.jobs_completed} jobs · Areas:{" "}
              {r.service_areas?.length ? r.service_areas.join(", ") : "—"}
            </p>
            {r.bio && <p className="mt-2 text-sm">{r.bio}</p>}
            {/* Only an approved pro can be assigned work, so only they can
                have a rate that would ever be charged. */}
            {r.status === "approved" && (
              <CommissionField
                profileId={r.profile_id}
                value={r.commission_rate ?? null}
                defaults={defaults}
                onSaved={(rate) => onRate(r.profile_id, rate)}
              />
            )}
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
