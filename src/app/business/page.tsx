"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { BusinessShell } from "@/components/BusinessShell";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Pill,
  Select,
  Spinner,
  Stat,
  Tabs,
  formatPKR,
} from "@/components/ui";
import { splitDispatchedJob } from "@/lib/money";
import {
  JOB_STATUS_LABEL,
  type BusinessMember,
  type Job,
  type Profile,
  type PublicCustomerRating,
} from "@/lib/types";

type Tab = "open" | "live";
type Member = BusinessMember & { profile?: Profile };

export default function BusinessDispatch() {
  const { user, loading } = useRequireAuth("/business");
  const toast = useToast();
  const [open, setOpen] = useState<Job[]>([]);
  const [live, setLive] = useState<Job[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [ratings, setRatings] = useState<Map<string, PublicCustomerRating>>(new Map());
  // job id -> the amount this business has already quoted on it.
  const [quotes, setQuotes] = useState<Map<string, number>>(new Map());
  const [fetching, setFetching] = useState(true);
  const [tab, setTab] = useState<Tab>("open");
  const [busy, setBusy] = useState<string | null>(null);
  // Which technician each job card is pointed at, keyed by job id.
  const [pick, setPick] = useState<Record<string, string>>({});
  // Quote composer, for custom jobs with no agreed price yet. One amount is
  // shared because only one composer is open at a time — but it MUST be
  // cleared when the composer moves, or job B opens pre-filled with the
  // figure typed for job A and Send submits that for B.
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");

  function openQuote(jobId: string) {
    setQuoteFor((cur) => (cur === jobId ? null : jobId));
    setQuoteAmount("");
  }

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();

    const [{ data: members }, { data: openRows }, { data: liveRows }] = await Promise.all([
      // Ordered so `team[0]` — the default assignee on every card — is
      // stable across reloads rather than whatever the planner returns.
      supabase
        .from("business_members")
        .select("*")
        .eq("business_id", user.id)
        .eq("status", "active")
        .order("invited_at", { ascending: true }),
      // `jobs_select` gives an active business the same open pool an
      // independent pro sees; there is no business-specific filter to apply.
      supabase
        .from("jobs")
        .select("*")
        .is("provider_id", null)
        .in("status", ["created", "bidding"])
        .order("created_at", { ascending: false }),
      // Excludes `paid` as well as rated/cancelled, so this list and
      // /business/earnings partition the work cleanly instead of showing a
      // paid-but-unrated job as both "out with your team" and "dispatched".
      supabase
        .from("jobs")
        .select("*")
        .eq("business_id", user.id)
        .not("status", "in", "(paid,rated,cancelled)")
        .order("updated_at", { ascending: false }),
    ]);

    const roster = (members as BusinessMember[]) || [];
    const openJobs = (openRows as Job[]) || [];
    const liveJobs = (liveRows as Job[]) || [];

    const techIds = roster.map((m) => m.provider_id);
    const custIds = [...new Set([...openJobs, ...liveJobs].map((j) => j.customer_id))];
    const [{ data: techProfiles }, { data: custRatings }] = await Promise.all([
      techIds.length
        ? supabase.from("profiles").select("*").in("id", techIds)
        : Promise.resolve({ data: [] as Profile[] }),
      custIds.length
        ? supabase.from("public_customer_ratings").select("*").in("id", custIds)
        : Promise.resolve({ data: [] as PublicCustomerRating[] }),
    ]);

    const byId = new Map(((techProfiles as Profile[]) || []).map((p) => [p.id, p]));
    setTeam(roster.map((m) => ({ ...m, profile: byId.get(m.provider_id) })));
    setOpen(openJobs);
    setLive(liveJobs);
    setRatings(new Map(((custRatings as PublicCustomerRating[]) || []).map((r) => [r.id, r])));

    // Quotes already out, so the board doesn't invite you to re-quote a job
    // you have already priced. `bids_business_read` is what makes these
    // visible — bids_rw alone shows a bid only to its author and the job's
    // customer, so without it business_place_bid wrote into a black hole.
    const openIds = openJobs.map((j) => j.id);
    if (openIds.length && techIds.length) {
      const { data: bidRows } = await supabase
        .from("bids")
        .select("job_id,provider_id,amount")
        .in("job_id", openIds)
        .in("provider_id", techIds)
        .eq("status", "pending");
      setQuotes(
        new Map(
          ((bidRows as { job_id: string; amount: number }[]) || []).map((b) => [
            b.job_id,
            Number(b.amount),
          ])
        )
      );
    } else {
      setQuotes(new Map());
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

  async function assign(job: Job) {
    const providerId = pick[job.id] || team[0]?.provider_id;
    if (!providerId) return;
    setBusy(job.id);
    const { error } = await createClient().rpc("business_assign_job", {
      p_job: job.id,
      p_provider: providerId,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Assigned. Your technician and the customer have both been notified.", "success");
    await load();
  }

  async function reassign(job: Job, providerId: string) {
    setBusy(job.id);
    const { error } = await createClient().rpc("business_reassign_job", {
      p_job: job.id,
      p_provider: providerId,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    await load();
  }

  /**
   * A custom job has no price until the customer accepts a quote, and
   * `business_assign_job` refuses one — there would be nothing to split. The
   * quote goes in under a named technician (bids_rw ties a bid to its own
   * author, so the RPC places it on their behalf); when the customer awards
   * it, `jobs_stamp_business` records the dispatch automatically.
   */
  async function sendQuote(job: Job) {
    const amount = Number(quoteAmount);
    const providerId = pick[job.id] || team[0]?.provider_id;
    if (!amount || !providerId) return;
    setBusy(job.id);
    const { error } = await createClient().rpc("business_place_bid", {
      p_job: job.id,
      p_provider: providerId,
      p_amount: amount,
      p_note: null,
      p_eta: null,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setQuoteFor(null);
    setQuoteAmount("");
    toast("Quote sent. It's assigned automatically if the customer accepts.", "success");
    // Reloads so the card picks up the outstanding quote; without this the
    // board gives no sign one was ever sent.
    await load();
  }

  const pipeline = useMemo(() => live.reduce((sum, j) => sum + (j.price ?? 0), 0), [live]);

  if (loading || fetching) {
    return (
      <BusinessShell>
        <Spinner label="Loading the board…" />
      </BusinessShell>
    );
  }

  const list = tab === "open" ? open : live;

  return (
    <BusinessShell>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat icon="briefcase" label="Open requests" value={open.length} />
        <Stat icon="clock" label="Jobs out" value={live.length} />
        <Stat
          icon="wallet"
          label="In pipeline"
          value={formatPKR(pipeline)}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {team.length === 0 && (
        <Card className="mt-6 bg-warning-light">
          <p className="text-sm font-semibold text-warning-foreground">
            No technicians on your team yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            You can see the open pool, but there is nobody to assign work to. Invite an approved
            technician by phone number from the Team tab.
          </p>
        </Card>
      )}

      <div className="mt-8 mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "open", label: `Open${open.length ? ` (${open.length})` : ""}` },
            { key: "live", label: `Out with your team${live.length ? ` (${live.length})` : ""}` },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === "open" ? "party" : "calendar"}
          title="Nothing here yet"
          hint={
            tab === "open"
              ? "No open jobs right now. Check back soon."
              : "Jobs you assign to your technicians show up here."
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {list.map((job) => {
            const rating = ratings.get(job.customer_id);
            const chosen = pick[job.id] || team[0]?.provider_id || "";
            const member = team.find((m) => m.provider_id === chosen);
            const assignee = team.find((m) => m.provider_id === job.provider_id);

            return (
              <Card key={job.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">{job.title}</h3>
                      {tab === "live" ? (
                        <Pill tone="info">{JOB_STATUS_LABEL[job.status]}</Pill>
                      ) : (
                        job.type === "custom" && <Pill tone="warn">Custom · quote</Pill>
                      )}
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
                      <span>
                        {!rating || rating.jobs_rated === 0
                          ? "New customer"
                          : `${rating.rating_avg} ★ (${rating.jobs_rated})`}
                      </span>
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-right font-bold text-primary">
                    {formatPKR(job.price)}
                  </p>
                </div>

                {tab === "live" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-sm">
                      With{" "}
                      <strong>{assignee?.profile?.full_name ?? "a technician"}</strong>
                      {job.tech_share !== null && (
                        <span className="text-muted-foreground">
                          {" "}
                          · they keep {Math.round(job.tech_share * 100)}%
                        </span>
                      )}
                    </p>
                    {job.status === "assigned" && team.length > 1 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">Move to</span>
                        <Select
                          className="w-auto"
                          aria-label="Reassign to"
                          value=""
                          disabled={busy === job.id}
                          onChange={(e) => e.target.value && reassign(job, e.target.value)}
                        >
                          <option value="">Choose…</option>
                          {team
                            .filter((m) => m.provider_id !== job.provider_id)
                            .map((m) => (
                              <option key={m.id} value={m.provider_id}>
                                {m.profile?.full_name ?? "Unnamed"}
                              </option>
                            ))}
                        </Select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    {team.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          className="w-auto"
                          aria-label="Assign to"
                          value={chosen}
                          onChange={(e) => setPick({ ...pick, [job.id]: e.target.value })}
                        >
                          {team.map((m) => (
                            <option key={m.id} value={m.provider_id}>
                              {m.profile?.full_name ?? "Unnamed"} · keeps{" "}
                              {Math.round(m.tech_share * 100)}%
                            </option>
                          ))}
                        </Select>

                        {job.price === null ? (
                          <>
                            {quotes.has(job.id) && (
                              <Pill tone="info">
                                Quoted {formatPKR(quotes.get(job.id) ?? 0)}
                              </Pill>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => openQuote(job.id)}>
                              {quoteFor === job.id
                                ? "Close"
                                : quotes.has(job.id)
                                  ? "Change quote"
                                  : "Send quote"}
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" disabled={busy === job.id} onClick={() => assign(job)}>
                            Assign
                          </Button>
                        )}
                      </div>
                    )}

                    {/* What the job is worth to you, at the chosen split —
                        the same arithmetic jobs_on_paid does when it's paid,
                        so the two can't disagree. */}
                    {job.price !== null && member && <Split job={job} share={member.tech_share} />}

                    {quoteFor === job.id && (
                      <div className="space-y-3">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={quoteAmount}
                          onChange={(e) => setQuoteAmount(e.target.value)}
                          placeholder="Your quote"
                          aria-label="Your quote"
                          prefix="Rs"
                        />
                        {member && Number(quoteAmount) > 0 && (
                          <Split
                            job={{ ...job, price: Number(quoteAmount) }}
                            share={member.tech_share}
                          />
                        )}
                        <Button
                          disabled={busy === job.id}
                          className="w-full"
                          onClick={() => sendQuote(job)}
                        >
                          Send quote
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </BusinessShell>
  );
}

/** The three legs of a dispatched job, shown before you commit to it. */
function Split({ job, share }: { job: Job; share: number }) {
  const { techCut, commission, businessNet } = splitDispatchedJob(
    job.price ?? 0,
    share,
    job.commission_rate
  );
  return (
    <p className="text-xs text-muted-foreground">
      Technician {formatPKR(techCut)} · commission {formatPKR(commission)} ·{" "}
      {/* Goes negative once the technician's share exceeds 1 − commission
          (e.g. 95% on a 15%-commission custom job). "You keep Rs -400" is
          not a sentence; say what actually happens. */}
      <strong className={businessNet < 0 ? "text-danger" : "text-foreground"}>
        {businessNet < 0
          ? `you pay ${formatPKR(-businessNet)}`
          : `you keep ${formatPKR(businessNet)}`}
      </strong>
    </p>
  );
}
