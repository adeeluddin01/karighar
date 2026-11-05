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
  LinkButton,
  Pill,
  Rating,
  Spinner,
  Stat,
  formatPKR,
} from "@/components/ui";
import { ProJobsList } from "@/components/ProJobsList";
import { summarizeLedger, type LedgerEntry, type LedgerSummary } from "@/lib/money";
import { useLanguage } from "@/lib/i18n";
import { type ServiceOption } from "@/lib/jobFilters";
import {
  JOB_STATUS_LABEL,
  type BusinessMember,
  type Job,
  type Profile,
  type Provider,
  type PublicCustomerRating,
} from "@/lib/types";

type Membership = BusinessMember & { business?: Profile };

export default function ProDashboard() {
  const { user, profile, loading } = useRequireAuth("/pro/dashboard");
  const { t } = useLanguage();
  const toast = useToast();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [available, setAvailable] = useState<Job[]>([]);
  const [mine, setMine] = useState<Job[]>([]);
  // Services for the filter bar — names only; the jobs themselves carry
  // service_id. Loaded once with the jobs, same as bookings mobile does.
  const [services, setServices] = useState<ServiceOption[]>([]);
  // The technician's side of a business relationship: an open invite to
  // answer, or the team they already work for.
  const [invite, setInvite] = useState<Membership | null>(null);
  const [team, setTeam] = useState<Membership | null>(null);
  const [fetching, setFetching] = useState(true);
  const [wallet, setWallet] = useState<LedgerSummary | null>(null);
  const [walletError, setWalletError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [custRatings, setCustRatings] = useState<Map<string, PublicCustomerRating>>(new Map());
  // Same never-stuck guarantee as the job view: a failed fetch used to
  // leave `fetching` true forever on the dashboard spinner.
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    setLoadError(false);
    try {
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

    {
      const approved = (prov as Provider | null)?.status === "approved";
      const [{ data: open }, { data: assigned }, ledger] = await Promise.all([
        approved
          ? supabase
              .from("jobs")
              .select("*")
              .is("provider_id", null)
              .in("status", ["created", "bidding"])
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        // Assigned jobs are fetched for every status, not just approved:
        // a suspended pro keeps the work they already hold, and the
        // suspended screen below needs the list to show it.
        // Paid jobs are NOT here: they live in History (which lists paid /
        // rated / cancelled), so the two screens partition the job list
        // with no overlap and no gap. Before this, a paid job showed on
        // both screens, and the dashboard's "active" list held finished work.
        supabase
          .from("jobs")
          .select("*")
          .eq("provider_id", user.id)
          .not("status", "in", "(rated,cancelled,paid)")
          .order("created_at", { ascending: false }),
        supabase.from("provider_ledger").select("*").eq("provider_id", user.id),
      ]);
      if (ledger.error) {
        setWalletError(true);
        setWallet(null);
      } else {
        setWalletError(false);
        setWallet(summarizeLedger((ledger.data as LedgerEntry[] | null) ?? []));
      }
      const openJobs = (open as Job[]) || [];
      const myJobs = (assigned as Job[]) || [];
      setAvailable(openJobs);
      setMine(myJobs);

      const { data: svcRows } = await supabase
        .from("services")
        .select("id,name")
        .eq("is_active", true)
        .order("name");
      setServices((svcRows as ServiceOption[]) || []);

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
    } catch {
      setLoadError(true);
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Passed to <ProJobsList> as onAccept: the list owns the busy state
  // around the call, so this just mutates, toasts and reloads.
  async function acceptFixed(job: Job) {
    const { error } = await createClient()
      .from("jobs")
      .update({ provider_id: user!.id, status: "assigned" })
      .eq("id", job.id);
    if (error) {
      toast("Couldn't accept that job — " + error.message, "error");
      return;
    }
    await load();
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

  // Passed to <ProJobsList> as onSubmitBid: the list owns the bid form
  // and clears it after this resolves.
  async function submitBid(jobId: string, amount: number, note: string | null) {
    await createClient().from("bids").insert({
      job_id: jobId,
      provider_id: user!.id,
      amount,
      note,
    });
    toast("Quote sent! The customer will be notified.", "success");
    await load();
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

  if (loadError) {
    return (
      <AppShell>
        <Card className="text-center">
          <p className="text-muted-foreground">
            Couldn&apos;t load your jobs — check your connection and try again.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setFetching(true);
              load();
            }}
          >
            Retry
          </Button>
        </Card>
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
    const inFlight = mine.filter((j) =>
      ["assigned", "en_route", "arrived", "in_progress"].includes(j.status),
    );
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
              : "You can't take new jobs while suspended, but the work you already hold still runs."
          }
        >
          <LinkButton href="/pro/onboarding" variant="ghost" size="sm">
            Edit profile
          </LinkButton>
          <LinkButton href="/support" variant="ghost" size="sm">
            Contact support
          </LinkButton>
        </EmptyState>
        {inFlight.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-bold">Jobs you already hold</h2>
            <div className="flex flex-col gap-4">
              {inFlight.map((job) => (
                <Link key={job.id} href={`/pro/jobs/view/?id=${job.id}`} className="opt">
                  <span className="flex w-full items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{job.title}</span>
                      <span className="block text-sm text-muted-foreground">{job.address}</span>
                    </span>
                    <span className="whitespace-nowrap text-end">
                      <Pill tone="info">{JOB_STATUS_LABEL[job.status]}</Pill>
                      <span className="mt-2 block font-bold">{formatPKR(job.price)}</span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </AppShell>
    );
  }

  // An attached technician has no open pool — `jobs_select` returns none, so
  // this is presentation catching up with RLS rather than a second gate.
  const attached = !!team;
  const activeCount = mine.filter((j) =>
    ["assigned", "en_route", "arrived", "in_progress"].includes(j.status),
  ).length;
  // Freelance cap (DB-enforced by patch v26): independent pros only.
  const atCap = !attached && activeCount >= 3;

  return (
    <AppShell>
      {/* Greeting */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={profile?.full_name || user?.email} src={profile?.avatar_url} size="lg" />
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
        {!attached && <Stat icon="briefcase" label={t("pro.openRequests")} value={available.length} />}
        <Stat icon="clock" label={t("pro.activeJobs")} value={mine.length} />
        <Stat
          icon="wallet"
          label={t("pro.inPipeline")}
          value={formatPKR(pipeline)}
          className={attached ? undefined : "col-span-2 sm:col-span-1"}
        />
        {wallet && wallet.commissionOwed > 0 && (
          <Stat icon="wallet" label={t("pro.owed")} value={formatPKR(wallet.commissionOwed)} />
        )}
        {wallet && wallet.businessShareNet < 0 && (
          <Stat
            icon="wallet"
            label={t("pro.dueBusiness")}
            value={formatPKR(-wallet.businessShareNet)}
          />
        )}
      </div>
      {walletError && (
        <p className="mt-3 text-xs text-destructive">
          Couldn&apos;t load your wallet — the figures above don&apos;t include commission. Try
          reloading.
        </p>
      )}

      {atCap && (
        <Card className="mt-4 bg-warning-light">
          <p className="text-sm font-semibold text-warning-foreground">
            You&apos;re at your 3 active jobs — finish one before taking another, so other pros get
            a turn.
          </p>
        </Card>
      )}

      {/* Karighar's own promo to its pros — copy comes from `house_promos`,
          so marketing can change it without a redeploy. Renders nothing when
          none is live. */}
      <HousePromo audience="provider" />

      {/* The jobs list — shared with the map tab's List area, so the
          two never drift apart. Tabs, filters, accept/quote all live
          inside it; this page keeps the greeting, stats and wallet. */}
      <div className="mt-8">
        <ProJobsList
          available={available}
          mine={mine}
          services={services}
          custRatings={custRatings}
          atCap={atCap}
          attached={attached}
          teamName={team?.business?.full_name}
          onAccept={acceptFixed}
          onSubmitBid={submitBid}
          headerActions={
            <LinkButton href="/pro/history" variant="ghost" size="sm" icon="history">
              {t("pro.history")}
            </LinkButton>
          }
        />
      </div>
    </AppShell>
  );
}
