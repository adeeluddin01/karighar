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
  Field,
  Input,
  Pill,
  Spinner,
} from "@/components/ui";
import type { BusinessMember, MembershipStatus, Profile } from "@/lib/types";

type Member = BusinessMember & { profile?: Profile };

const TONE: Record<MembershipStatus, "ok" | "warn" | "gray" | "bad"> = {
  active: "ok",
  invited: "warn",
  declined: "bad",
  removed: "gray",
};

export default function BusinessTeam() {
  const { user, loading } = useRequireAuth("/business/team");
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [fetching, setFetching] = useState(true);
  const [phone, setPhone] = useState("");
  const [sharePct, setSharePct] = useState("70");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("business_members")
      .select("*")
      .eq("business_id", user.id)
      .order("invited_at", { ascending: false });
    const rows = (data as BusinessMember[]) || [];

    // `profiles_business_team` makes these readable for anyone we've invited
    // or who is on the team, so one batched read covers the whole list.
    const ids = [...new Set(rows.map((m) => m.provider_id))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("*").in("id", ids)
      : { data: [] };
    const byId = new Map(((profiles as Profile[]) || []).map((p) => [p.id, p]));

    setMembers(rows.map((m) => ({ ...m, profile: byId.get(m.provider_id) })));
    setFetching(false);
  }, [user]);

  useEffect(() => {
    // Wrapped so nothing in load() runs synchronously in the effect body —
    // every setState in it is behind an await. Same shape as /pro/history.
    void (async () => {
      await load();
    })();
  }, [load]);

  // `Number("")` is 0, so an empty box would read as a valid 0% share and
  // invite someone to keep nothing. Checked here and used to disable Send, so
  // the button is visibly dead rather than silently doing the wrong thing.
  const sharePctNum = Number(sharePct);
  const shareValid =
    sharePct.trim() !== "" && Number.isFinite(sharePctNum) && sharePctNum >= 0 && sharePctNum <= 100;

  async function invite() {
    if (!phone.trim() || !shareValid) return;
    const share = sharePctNum / 100;
    setBusy("invite");
    const { error } = await createClient().rpc("business_invite_technician", {
      p_phone: phone.trim(),
      p_share: share,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setPhone("");
    toast("Invite sent. They'll see it on their dashboard.", "success");
    await load();
  }

  async function setShare(m: Member, pct: number) {
    setBusy(m.id);
    const { error } = await createClient().rpc("business_set_share", {
      p_member: m.id,
      p_share: pct / 100,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    await load();
  }

  async function remove(m: Member) {
    setBusy(m.id);
    const { error } = await createClient().rpc("business_remove_member", { p_member: m.id });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    await load();
  }

  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "invited");
  const past = members.filter((m) => m.status === "declined" || m.status === "removed");

  if (loading || fetching) {
    return (
      <BusinessShell>
        <Spinner label="Loading your team…" />
      </BusinessShell>
    );
  }

  return (
    <BusinessShell>
      <Card>
        <h2 className="text-xl font-bold tracking-tight">Invite a technician</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          They must already be a verified Karighar technician — we check every identity
          ourselves, and a business never vouches for one. A technician can only be on one team,
          and joining yours takes them out of the open job pool.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Field label="Their phone number" hint="However they typed it at signup">
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0300 1234567"
                aria-label="Phone number"
              />
            </Field>
          </div>
          <div className="w-40">
            <Field label="They keep (%)" hint="of each job's price">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={sharePct}
                error={!shareValid}
                onChange={(e) => setSharePct(e.target.value)}
                aria-label="Technician share, percent"
              />
            </Field>
          </div>
          <Button disabled={busy === "invite" || !phone.trim() || !shareValid} onClick={invite}>
            Send invite
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          You keep the rest and pay Karighar&apos;s commission out of your side — your technicians
          owe Karighar nothing.
        </p>
      </Card>

      {pending.length > 0 && (
        <Section title="Waiting on a reply" count={pending.length}>
          {pending.map((m) => (
            <MemberCard key={m.id} m={m} busy={busy === m.id} onRemove={remove} />
          ))}
        </Section>
      )}

      <Section title="Your technicians" count={active.length}>
        {active.length === 0 ? (
          <EmptyState
            icon="users"
            title="Nobody on the team yet"
            hint="Invite a verified technician by phone number above."
          />
        ) : (
          active.map((m) => (
            <MemberCard
              key={m.id}
              m={m}
              busy={busy === m.id}
              onRemove={remove}
              onShare={setShare}
            />
          ))
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Past and declined" count={past.length}>
          {past.map((m) => (
            <MemberCard key={m.id} m={m} busy={busy === m.id} />
          ))}
        </Section>
      )}
    </BusinessShell>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function MemberCard({
  m,
  busy,
  onRemove,
  onShare,
}: {
  m: Member;
  busy: boolean;
  onRemove?: (m: Member) => void;
  onShare?: (m: Member, pct: number) => void;
}) {
  const saved = Math.round(m.tech_share * 100);
  const [pct, setPct] = useState(String(saved));

  // Resync when the saved value changes underneath us — this card is keyed on
  // m.id, so it survives a reload and the draft would otherwise go stale.
  // Without it, another dispatcher lowering someone's share leaves this tab
  // showing a "Save" button preloaded with the OLD number, one click from
  // reverting their change. React's documented adjust-state-during-render
  // pattern; an effect here would trip react-hooks/set-state-in-effect.
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setPct(String(saved));
  }

  // `Number("")` is 0, so an empty box would otherwise read as a valid 0% and
  // silently set the technician to keep nothing out of every job.
  const n = Number(pct);
  const valid = pct.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
  const changed = valid && n !== saved;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={m.profile?.full_name} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold">{m.profile?.full_name ?? "Unnamed"}</h3>
              <Pill tone={TONE[m.status]}>{m.status}</Pill>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {m.profile?.phone ?? "no phone"} · keeps {Math.round(m.tech_share * 100)}%
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onShare && (
            <>
              {/* No `prefix="%"` — <Input> renders prefix BEFORE the field,
                  which is right for "Rs" and reads as "% 70" here. */}
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={pct}
                error={!valid}
                onChange={(e) => setPct(e.target.value)}
                aria-label={`Percent kept by ${m.profile?.full_name ?? "this technician"}`}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
              {changed && (
                <Button size="sm" disabled={busy} onClick={() => onShare(m, n)}>
                  Save
                </Button>
              )}
            </>
          )}
          {onRemove && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(m)}>
              {m.status === "invited" ? "Cancel invite" : "Remove"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
