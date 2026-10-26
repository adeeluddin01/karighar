"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Pill,
  Rating,
  Spinner,
} from "@/components/ui";
import type { Business, BusinessMember, BusinessStatus, Profile } from "@/lib/types";

type Row = Business & { profile?: Profile; team: (BusinessMember & { profile?: Profile })[] };

const TONE: Record<BusinessStatus, "ok" | "gray"> = { active: "ok", suspended: "gray" };

export default function AdminBusinesses() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [fetching, setFetching] = useState(true);
  const [grantId, setGrantId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: bizRows } = await supabase
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (bizRows as Business[]) || [];

    if (!list.length) {
      setRows([]);
      setFetching(false);
      return;
    }

    const ids = list.map((b) => b.profile_id);
    const [{ data: members }, { data: owners }] = await Promise.all([
      supabase.from("business_members").select("*").in("business_id", ids),
      supabase.from("profiles").select("*").in("id", ids),
    ]);
    const team = (members as BusinessMember[]) || [];

    // One more read for the technicians' names; `bm_admin` already let us see
    // the membership rows themselves.
    const techIds = [...new Set(team.map((m) => m.provider_id))];
    const { data: techs } = techIds.length
      ? await supabase.from("profiles").select("*").in("id", techIds)
      : { data: [] };

    const byId = new Map(
      [...((owners as Profile[]) || []), ...((techs as Profile[]) || [])].map((p) => [p.id, p])
    );
    setRows(
      list.map((b) => ({
        ...b,
        profile: byId.get(b.profile_id),
        team: team
          .filter((m) => m.business_id === b.profile_id && m.status !== "removed")
          .map((m) => ({ ...m, profile: byId.get(m.provider_id) })),
      }))
    );
    setFetching(false);
  }, []);

  useEffect(() => {
    // Wrapped so nothing in load() runs synchronously in the effect body —
    // every setState in it is behind an await. Same shape as /pro/history.
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * Granting takes the profile id rather than an email: `profiles` has no
   * email column (it lives in `auth.users`, which the anon key cannot read),
   * and adding a lookup RPC would mean a way to probe who has an account.
   * The id is a copy-paste from Supabase → Authentication → Users, which is
   * the same place the first admin is made.
   */
  async function grant() {
    const id = grantId.trim();
    if (!id) return;
    setBusy("grant");
    const { error } = await createClient().rpc("grant_business_account", { p_profile: id });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setGrantId("");
    toast("Business account granted.", "success");
    await load();
  }

  async function setStatus(id: string, status: BusinessStatus) {
    setBusy(id);
    const { error } = await createClient().rpc("set_business_status", {
      p_profile: id,
      p_status: status,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    await load();
  }

  return (
    <AdminShell>
      <Card>
        <h2 className="text-xl font-bold tracking-tight">Grant a business account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Businesses are created by hand — there is no public signup. The account must already
          exist, and must not be an approved technician: a business dispatches work rather than
          doing it.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <Field
              label="User id"
              hint="Supabase → Authentication → Users → copy the UID"
            >
              <Input
                value={grantId}
                onChange={(e) => setGrantId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                aria-label="User id"
              />
            </Field>
          </div>
          <Button disabled={busy === "grant" || !grantId.trim()} onClick={grant}>
            Grant
          </Button>
        </div>
      </Card>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Business accounts</h2>
          <span className="text-xs text-muted-foreground">{rows.length} total</span>
        </div>

        {fetching ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="building"
            title="No business accounts yet"
            hint="Grant one above to let a company dispatch jobs to its own technicians."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((r) => (
              <Card key={r.profile_id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={r.profile?.full_name} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold">
                          {r.profile?.full_name ?? "Unnamed business"}
                        </h3>
                        <Pill tone={TONE[r.status]}>{r.status}</Pill>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.profile?.phone ?? "no phone"} · {r.team.filter((m) => m.status === "active").length}{" "}
                        on the team
                      </p>
                      {/* `jobs_completed` is a RATING count, not a job count —
                          on_review_change maintains it from `reviews`, exactly
                          as providers.jobs_completed does despite its name.
                          Labelling it "jobs dispatched" would contradict the
                          business's own /business/earnings figure. */}
                      <p className="mt-1 text-xs text-muted-foreground">
                        <Rating value={r.rating_avg} /> · {r.jobs_completed}{" "}
                        {r.jobs_completed === 1 ? "rating" : "ratings"}
                      </p>
                      {r.team.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
                          {r.team.map((m) => (
                            <li key={m.id}>
                              {m.profile?.full_name ?? "Unnamed"} ·{" "}
                              <span className={m.status === "active" ? "" : "italic"}>
                                {m.status}
                              </span>{" "}
                              · keeps {Math.round(m.tech_share * 100)}%
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === r.profile_id}
                        onClick={() => setStatus(r.profile_id, "suspended")}
                      >
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy === r.profile_id}
                        onClick={() => setStatus(r.profile_id, "active")}
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
