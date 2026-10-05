"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
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
import { JOB_STATUS_LABEL, type Job, type Provider } from "@/lib/types";

type Tab = "open" | "active";

export default function ProDashboard() {
  const { user, profile, loading } = useRequireAuth("/pro/dashboard");
  const toast = useToast();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [available, setAvailable] = useState<Job[]>([]);
  const [mine, setMine] = useState<Job[]>([]);
  const [fetching, setFetching] = useState(true);
  const [tab, setTab] = useState<Tab>("open");
  const [bidFor, setBidFor] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidNote, setBidNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: prov } = await supabase
      .from("providers")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();
    setProvider(prov as Provider | null);

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
      setAvailable((open as Job[]) || []);
      setMine((assigned as Job[]) || []);
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

  const list = tab === "open" ? available : mine;

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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat icon="briefcase" label="Open requests" value={available.length} />
        <Stat icon="clock" label="Active jobs" value={mine.length} />
        <Stat
          icon="wallet"
          label="In pipeline"
          value={formatPKR(pipeline)}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Tabs */}
      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "open", label: `Open${available.length ? ` (${available.length})` : ""}` },
            { key: "active", label: `Your jobs${mine.length ? ` (${mine.length})` : ""}` },
          ]}
        />
        <LinkButton href="/pro/history" variant="ghost" size="sm" icon="trend">
          Earnings
        </LinkButton>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === "open" ? "party" : "calendar"}
          title="Nothing here yet"
          hint={
            tab === "open"
              ? "No open jobs right now. Check back soon."
              : "Jobs you accept will show up here."
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {tab === "active"
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
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon name="calendar" size="sm" />
                    {job.scheduled_at
                      ? new Date(job.scheduled_at).toLocaleString("en-PK")
                      : "Flexible time"}
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
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon name="calendar" size="sm" />
                        {job.scheduled_at
                          ? new Date(job.scheduled_at).toLocaleString("en-PK")
                          : "Flexible time"}
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
