"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { JobChat } from "@/components/JobChat";
import { ProviderTracker } from "@/components/maps/ProviderTracker";
import { TrackingMap } from "@/components/maps/TrackingMap";
import { DisputeButton } from "@/components/DisputeButton";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  Button,
  Card,
  Input,
  KV,
  LinkButton,
  Pill,
  Spinner,
  formatPKR,
} from "@/components/ui";
import { JOB_STATUS_LABEL, type Job, type JobStatus, type Profile } from "@/lib/types";

// What the provider can do next at each stage.
const NEXT: Partial<Record<JobStatus, { to: JobStatus; label: string }>> = {
  assigned: { to: "en_route", label: "I'm on the way" },
  en_route: { to: "arrived", label: "I've arrived" },
  arrived: { to: "in_progress", label: "Start work" },
  in_progress: { to: "completed", label: "Mark completed" },
  completed: { to: "paid", label: "Cash received" },
};

function ProJobDetailContent() {
  const jobId = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { user, loading } = useRequireAuth(`/pro/jobs/view/?id=${jobId}`);
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<Profile | null>(null);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [priceInput, setPriceInput] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
    const j = data as Job | null;
    setJob(j);
    if (j) {
      const { data: cust } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", j.customer_id)
        .maybeSingle();
      setCustomer(cust as Profile | null);
    }
    setFetching(false);
  }, [jobId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function advance(to: JobStatus) {
    if (to === "completed" && (job?.price == null || job.price === 0)) {
      toast("Set the final price before completing this job.", "error");
      return;
    }
    setBusy(true);
    await createClient().from("jobs").update({ status: to }).eq("id", jobId);
    await load();
    setBusy(false);
  }

  async function setPrice() {
    const value = Number(priceInput);
    if (!value || value <= 0) {
      toast("Enter a valid amount", "error");
      return;
    }
    setBusy(true);
    const { error } = await createClient().from("jobs").update({ price: value }).eq("id", jobId);
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setPriceInput("");
    toast("Price set — the customer can see it now.", "success");
    await load();
  }

  if (loading || fetching) {
    return (
      <AppShell>
        <Spinner label="Loading job…" />
      </AppShell>
    );
  }
  if (!job) {
    return (
      <AppShell>
        <Card className="text-center">
          <p className="text-muted-foreground">Job not found.</p>
          <LinkButton href="/pro/dashboard" variant="ghost" size="sm" className="mt-4">
            Back to dashboard
          </LinkButton>
        </Card>
      </AppShell>
    );
  }

  const next = NEXT[job.status];
  const isLive = ["en_route", "arrived", "in_progress"].includes(job.status);

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" round onClick={() => router.back()} aria-label="Back">
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{job.title}</h1>
          <p className="text-sm text-muted-foreground">{job.address}</p>
        </div>
        <div className="whitespace-nowrap text-right">
          <Pill tone={job.status === "paid" ? "ok" : "info"}>{JOB_STATUS_LABEL[job.status]}</Pill>
          <p className="mt-2 text-lg font-extrabold">{formatPKR(job.price)}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* ---------- left ---------- */}
        <div className="flex flex-col gap-5">
          {/* Live location sharing + route map */}
          {isLive && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">Live location</h2>
                <Pill tone="ok">
                  <span className="live" /> Sharing
                </Pill>
              </div>
              <ProviderTracker jobId={jobId} autoStart={job.status === "en_route"} />
              <div className="mt-3">
                <TrackingMap
                  jobId={jobId}
                  destination={
                    job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null
                  }
                />
              </div>
            </Card>
          )}

          {user && (
            <Card>
              <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
                <Icon name="chat" size="sm" /> Messages
              </h2>
              <JobChat jobId={jobId} userId={user.id} />
            </Card>
          )}
        </div>

        {/* ---------- right ---------- */}
        <div className="flex flex-col gap-5">
          {/* Quote job: Pro sets the final price once (then it's locked) */}
          {job.price == null && !["rated", "paid", "cancelled"].includes(job.status) && (
            <Card className="bg-warning-light">
              <p className="text-sm font-semibold text-warning-foreground">This job needs a price</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Inspect the work, then set the final price for the customer.
              </p>
              <div className="mt-3 space-y-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Final price"
                  prefix="Rs"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  aria-label="Final price"
                />
                <Button disabled={busy} className="w-full" onClick={setPrice}>
                  Set price
                </Button>
              </div>
            </Card>
          )}

          {/* Next action */}
          {next && (
            <Button className="w-full" disabled={busy} onClick={() => advance(next.to)}>
              {next.label}
            </Button>
          )}

          {job.status === "paid" && (
            <Card className="bg-success-light text-center">
              <p className="text-sm font-semibold text-success">Job complete</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Commission owed:{" "}
                {formatPKR(job.price ? job.price * job.commission_rate : 0)}
              </p>
            </Card>
          )}

          {/* Customer */}
          {customer && (
            <Card>
              <div className="flex items-center gap-3">
                <Avatar name={customer.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="truncate font-semibold">{customer.full_name ?? "Customer"}</p>
                </div>
              </div>
              {customer.phone && (
                <div className="mt-4 flex gap-2">
                  <a href={`tel:${customer.phone}`} className="btn-primary btn-sm flex-1">
                    <Icon name="phone" size="sm" /> Call
                  </a>
                  <a
                    className="btn-ghost btn-sm flex-1"
                    target="_blank"
                    rel="noopener"
                    href={`https://www.google.com/maps/search/${encodeURIComponent(job.address)}`}
                  >
                    <Icon name="pin" size="sm" /> Directions
                  </a>
                </div>
              )}
            </Card>
          )}

          {/* Details */}
          <Card>
            <h2 className="mb-2 text-base font-bold">Job details</h2>
            <KV label="When">
              {job.scheduled_at
                ? new Date(job.scheduled_at).toLocaleString("en-PK")
                : "Flexible time"}
            </KV>
            <KV label="Type">{job.type === "custom" ? "Custom job" : "Fixed price"}</KV>
            <KV label="Commission">{Math.round(job.commission_rate * 100)}%</KV>
            {job.description && (
              <>
                <div className="sep" />
                <p className="text-xs font-semibold text-muted-foreground">Customer notes</p>
                <p className="mt-1 text-sm">{job.description}</p>
              </>
            )}
          </Card>

          {user && <DisputeButton jobId={jobId} userId={user.id} />}
        </div>
      </div>
    </AppShell>
  );
}

export default function ProJobDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <Spinner label="Loading…" />
        </AppShell>
      }
    >
      <ProJobDetailContent />
    </Suspense>
  );
}
