"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import { HousePromo } from "@/components/HousePromo";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Input,
  LinkButton,
  Pill,
  Rating,
  Spinner,
  Stat,
  Tabs,
  formatPKR,
} from "@/components/ui";
import {
  JOB_STATUS_LABEL,
  type BusinessMember,
  type Job,
  type Profile,
  type Provider,
  type PublicCustomerRating,
} from "@/lib/types";

type Tab = "open" | "active";
type Membership = BusinessMember & { business?: Profile };

export default function ProDashboard() {
  const { user, profile, loading } = useRequireAuth("/pro/dashboard");
  const toast = useToast();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [available, setAvailable] = useState<Job[]>([]);
  const [mine, setMine] = useState<Job[]>([]);
  // The technician's side of a business relationship: an open invite to
  // answer, or the team they already work for.
  const [invite, setInvite] = useState<Membership | null>(null);
  const [team, setTeam] = useState<Membership | null>(null);
  const [fetching, setFetching] = useState(true);
  const [tab, setTab] = useState<Tab>("open");
  const [bidFor, setBidFor] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidNote, setBidNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [custRatings, setCustRatings] = useState<Map<string, PublicCustomerRating>>(new Map());

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: prov } = await supabase
      .from("providers")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();
    setProvider(prov as Provider | null);

    // Membership first: an attached technician gets no open pool at all, and
    // `jobs_select` already returns zero rows for them — this just means the
    // tab doesn't flash up empty before the UI catches up.
    const { data: memberships } = await supabase
      .from("business_members")
      .select("*")
      .eq("provider_id", user.id)
      .in("status", ["invited", "active"]);
    const rows = (memberships as BusinessMember[]) || [];
    const activeRow = rows.find((m) => m.status === "active") ?? null;
    const invitedRow = rows.find((m) => m.status === "invited") ?? null;

    const bizIds = [...new Set(rows.map((m) => m.business_id))];
    const { data: bizProfiles } = bizIds.length
      ? await supabase.from("profiles").select("*").in("id", bizIds)
      : { data: [] };
    const bizById = new Map(((bizProfiles as Profile[]) || []).map((p) => [p.id, p]));
    const attach = (m: BusinessMember | null): Membership | null =>
      m ? { ...m, business: bizById.get(m.business_id) } : null;

    setTeam(attach(activeRow));
    setInvite(attach(invitedRow));

    if ((prov as Provider | null)?.status === "approved") {
      const [{ data: open }, { data: assigned }] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .is("provider_id", null)
          .in("status", ["created", "bidding"])
          .order("created_at", { ascending: false }),
        supabase
          .from("jobs")
          .select("*")
          .eq("provider_id", user.id)
          .not("status", "in", "(rated,cancelled)")
          .order("created_at", { ascending: false }),
      ]);
      const openJobs = (open as Job[]) || [];
      const myJobs = (assigned as Job[]) || [];
      setAvailable(openJobs);
      setMine(myJobs);

      // One batched read of the ratings view — it carries the aggregates only,
      // so this works for the open pool too, where the provider has no
      // relationship to the customer yet.
      const ids = [...new Set([...openJobs, ...myJobs].map((j) => j.customer_id))];
      if (ids.length) {
        const { data: ratings } = await supabase
          .from("public_customer_ratings")
          .select("*")
          .in("id", ids);
        setCustRatings(
          new Map(
            ((ratings as PublicCustomerRating[]) ?? []).map((r) => [r.id, r])
          )
        );
      }
    }
    setFetching(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function acceptFixed(job: Job) {
    setBusy(true);
    await createClient()
      .from("jobs")
      .update({ provider_id: user!.id, status: "assigned" })
      .eq("id", job.id);
    await load();
    setBusy(false);
  }

  async function respondToInvite(accept: boolean) {
    if (!invite) return;
    setBusy(true);
    const { error } = await createClient().rpc("business_respond_invite", {
      p_member: invite.id,
      p_accept: accept,
    });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(
      accept
        ? `You're on ${invite.business?.full_name ?? "the"} team. Your jobs now come from them.`
        : "Invite declined.",
      "success"
    );
    await load();
  }

  async function leaveTeam() {
    if (!team) return;
    setBusy(true);
    const { error } = await createClient().rpc("business_remove_member", { p_member: team.id });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("You've left the team. The open job pool is yours again.", "success");
    await load();
  }

  async function submitBid(jobId: string) {
    const amount = Number(bidAmount);
    if (!amount) return;
    setBusy(true);
    await createClient().from("bids").insert({
      job_id: jobId,
      provider_id: user!.id,
      amount,
      note: bidNote || null,
    });
    setBidFor(null);
    setBidAmount("");
    setBidNote("");
    setBusy(false);
    toast("Quote sent! The customer will be notified.", "success");
  }

  // Money still owed on jobs in flight, as a quick "pipeline" figure.
  const pipeline = useMemo(() => mine.reduce((sum, j) => sum + (j.price ?? 0), 0), [mine]);

  if (loading || fetching) {
    return (
      <AppShell>
        <Spinner label="Loading your jobs…" />
      </AppShell>
    );
  }

  if (!provider) {
    return (
      <AppShell>
        <EmptyState
          icon="briefcase"
          title="Your pro profile isn't set up yet"
          hint="Finish onboarding to start receiving jobs."
        >
          <LinkButton href="/pro/onboarding" size="sm">
            Complete onboarding
          </LinkButton>
        </EmptyState>
      </AppShell>
    );
  }

  if (provider.status !== "approved") {
    return (
      <AppShell>
        <EmptyState
          icon={provider.status === "pending" ? "hourglass" : "ban"}
          title={
            provider.status === "pending"
              ? "Verification in progress"
              : `Account ${provider.status}`
          }
          hint={
            provider.status === "pending"
              ? "Our team is reviewing your profile. You'll be able to accept jobs once approved (usually 1–2 days)."
              : "Please contact support for details."
          }
        >
          <LinkButton href="/pro/onboarding" variant="ghost" size="sm">
            Edit profile
          </LinkButton>
          <LinkButton href="/support" variant="ghost" size="sm">
            Contact support
          </LinkButton>
        </EmptyState>
      </AppShell>
    );
  }

  // An attached technician has no open pool — `jobs_select` returns none, so
  // this is presentation catching up with RLS rather than a second gate.
  const attached = !!team;
  const effTab: Tab = attached ? "active" : tab;
  const list = effTab === "open" ? available : mine;

  return (
    <AppShell>
      {/* Greeting */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={profile?.full_name || user?.email} size="lg" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Salaam, {profile?.full_name?.split(" ")[0] ?? "Pro"}
            </h1>
            <p className="text-sm text-muted-foreground">
              <Rating value={provider.rating_avg} /> · {provider.jobs_completed} jobs done
            </p>
          </div>
        </div>
        <Pill tone="ok" icon="shield">
          Approved
        </Pill>
      </div>

      {/* A pending team invite, which is the one thing that should interrupt
          this screen — accepting it changes where every future job comes
          from. */}
      {invite && (
        <Card className="mb-6 bg-warning-light">
          <p className="text-sm font-semibold text-warning-foreground">
            {invite.business?.full_name ?? "A business"} invited you to their team
          </p>
          <p className="mt-1 text-sm">
            You&apos;d keep <strong>{Math.round(invite.tech_share * 100)}%</strong> of every job
            they send you, and owe Karighar no commission — they pay it.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            While you&apos;re on a team you don&apos;t pick up jobs from the open pool; your work
            comes from them. You can leave at any time.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => respondToInvite(true)}>
              Join the team
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => respondToInvite(false)}
            >
              Decline
            </Button>
          </div>
        </Card>
      )}

      {team && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Working with {team.business?.full_name ?? "your business"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                They send you the work and keep {100 - Math.round(team.tech_share * 100)}% of each
                job; you keep {Math.round(team.tech_share * 100)}% and owe Karighar nothing.
              </p>
            </div>
            <Button variant="ghost" size="sm" disabled={busy} onClick={leaveTeam}>
              Leave team
            </Button>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {!attached && <Stat icon="briefcase" label="Open requests" value={available.length} />}
        <Stat icon="clock" label="Active jobs" value={mine.length} />
        <Stat
          icon="wallet"
          label="In pipeline"
          value={formatPKR(pipeline)}
          className={attached ? undefined : "col-span-2 sm:col-span-1"}
        />
      </div>

      {/* Karighar's own promo to its pros — copy comes from `house_promos`,
          so marketing can change it without a redeploy. Renders nothing when
          none is live. */}
      <HousePromo audience="provider" />

      {/* Tabs */}
      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
        {attached ? (
          <h2 className="text-xl font-bold tracking-tight">
            Your jobs{mine.length ? ` (${mine.length})` : ""}
          </h2>
        ) : (
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "open", label: `Open${available.length ? ` (${available.length})` : ""}` },
              { key: "active", label: `Your jobs${mine.length ? ` (${mine.length})` : ""}` },
            ]}
          />
        )}
        <LinkButton href="/pro/history" variant="ghost" size="sm" icon="trend">
          Earnings
        </LinkButton>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={effTab === "open" ? "party" : "calendar"}
          title="Nothing here yet"
          hint={
            effTab === "open"
              ? "No open jobs right now. Check back soon."
              : attached
                ? `${team?.business?.full_name ?? "Your business"} hasn't sent you anything yet. New jobs show up here.`
                : "Jobs you accept will show up here."
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {effTab === "active"
            ? mine.map((job) => (
                <Link key={job.id} href={`/pro/jobs/view/?id=${job.id}`} className="opt">
                  <span className="flex w-full items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{job.title}</span>
                      <span className="block text-sm text-muted-foreground">{job.address}</span>
                    </span>
                    <span className="whitespace-nowrap text-right">
                      <Pill tone="info">{JOB_STATUS_LABEL[job.status]}</Pill>
                      <span className="mt-2 block font-bold">{formatPKR(job.price)}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Icon name="calendar" size="sm" />
                      {job.scheduled_at
                        ? new Date(job.scheduled_at).toLocaleString("en-PK")
                        : "Flexible time"}
                    </span>
                    <CustomerRating rating={custRatings.get(job.customer_id)} />
                  </span>
                </Link>
              ))
            : available.map((job) => (
                <Card key={job.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold">{job.title}</h3>
                        {job.type === "custom" && <Pill tone="warn">Custom · quote</Pill>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{job.address}</p>
                      {job.description && <p className="mt-1 text-sm">{job.description}</p>}
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Icon name="calendar" size="sm" />
                          {job.scheduled_at
                            ? new Date(job.scheduled_at).toLocaleString("en-PK")
                            : "Flexible time"}
                        </span>
                        <CustomerRating rating={custRatings.get(job.customer_id)} />
                      </p>
                    </div>
                    <div className="whitespace-nowrap text-right">
                      <p className="font-bold text-primary">{formatPKR(job.price)}</p>
                      {job.type === "fixed" ? (
                        <Button
                          size="sm"
                          className="mt-2"
                          disabled={busy}
                          onClick={() => acceptFixed(job)}
                        >
                          Accept
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2"
                          onClick={() => setBidFor(bidFor === job.id ? null : job.id)}
                        >
                          {bidFor === job.id ? "Close" : "Send quote"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {bidFor === job.id && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        placeholder="Your quote"
                        aria-label="Your quote"
                        prefix="Rs"
                      />
                      <Input
                        value={bidNote}
                        onChange={(e) => setBidNote(e.target.value)}
                        placeholder="Note (optional) — what's included"
                        aria-label="Quote note"
                      />
                      <Button disabled={busy} className="w-full" onClick={() => submitBid(job.id)}>
                        Submit quote
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
        </div>
      )}
    </AppShell>
  );
}

/**
 * The customer's rating, as a pro sees it before accepting. A customer with no
 * ratings yet reads as "New customer" rather than 0.0 stars.
 */
function CustomerRating({ rating }: { rating?: PublicCustomerRating }) {
  if (!rating || rating.jobs_rated === 0) {
    return <span>New customer</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <Rating value={rating.rating_avg} />
      <span>
        ({rating.jobs_rated} {rating.jobs_rated === 1 ? "rating" : "ratings"})
      </span>
    </span>
  );
}
