"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { JobTimeline } from "@/components/JobTimeline";
import { JobChat } from "@/components/JobChat";
import { TrackingMap } from "@/components/maps/TrackingMap";
import { DisputeButton } from "@/components/DisputeButton";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  Button,
  Card,
  KV,
  LinkButton,
  Pill,
  Rating,
  Select,
  Spinner,
  Textarea,
  formatPKR,
} from "@/components/ui";
import { fetchPublicPros } from "@/lib/providers";
import { JOB_STATUS_LABEL, type Job, type Bid, type Profile } from "@/lib/types";
import { clsx } from "@/lib/clsx";

type BidWithPro = Bid & { pro?: Profile; rating?: number };

const CANCEL_REASONS = [
  "Changed my mind",
  "Booked by mistake",
  "Found another provider",
  "Pro not responding",
  "Scheduling conflict",
  "Other",
];

function BookingDetailContent() {
  const search = useSearchParams();
  const jobId = search.get("id") ?? "";
  const isNew = search.get("new") === "1";
  const { user, loading } = useRequireAuth(`/bookings/view/?id=${jobId}`);
  const toast = useToast();

  const [job, setJob] = useState<Job | null>(null);
  const [providerProfile, setProviderProfile] = useState<Profile | null>(null);
  const [providerRating, setProviderRating] = useState<number | null>(null);
  const [bids, setBids] = useState<BidWithPro[]>([]);
  const [hasReview, setHasReview] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: jobData } = await supabase.from("jobs").select("*").eq("id", jobId).single();
    const j = jobData as Job | null;
    setJob(j);
    if (!j) {
      setFetching(false);
      return;
    }

    if (j.provider_id) {
      // Ratings come from the public view: `providers` itself is owner/admin
      // only, because it holds CNIC numbers (patch_v11).
      const [{ data: prof }, prov] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", j.provider_id).single(),
        fetchPublicPros(supabase, { id: j.provider_id }),
      ]);
      setProviderProfile(prof as Profile | null);
      setProviderRating(prov.pros[0]?.rating_avg ?? null);
    }

    if (j.type === "custom" && j.status === "bidding") {
      const { data: bidData } = await supabase
        .from("bids")
        .select("*")
        .eq("job_id", jobId)
        .eq("status", "pending")
        .order("amount");
      const list = (bidData as Bid[]) || [];
      const proIds = [...new Set(list.map((b) => b.provider_id))];
      const { data: profs } = proIds.length
        ? await supabase.from("profiles").select("*").in("id", proIds)
        : { data: [] };
      const { pros: rated } = await fetchPublicPros(supabase, { ids: proIds });
      setBids(
        list.map((b) => ({
          ...b,
          pro: (profs as Profile[])?.find((p) => p.id === b.provider_id),
          rating: rated.find((p) => p.id === b.provider_id)?.rating_avg,
        }))
      );
    }

    const { count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);
    setHasReview((count ?? 0) > 0);
    setFetching(false);
  }, [jobId]);

  useEffect(() => {
    if (!user) return;
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, jobId, load]);

  async function acceptBid(bid: BidWithPro) {
    setBusy(true);
    const supabase = createClient();
    await supabase
      .from("jobs")
      .update({ provider_id: bid.provider_id, price: bid.amount, status: "assigned" })
      .eq("id", jobId);
    await supabase.from("bids").update({ status: "awarded" }).eq("id", bid.id);
    await supabase.from("bids").update({ status: "rejected" }).eq("job_id", jobId).neq("id", bid.id);
    await load();
    setBusy(false);
  }

  async function cancelJob() {
    setBusy(true);
    // .select().single() so a silent 0-row update (e.g. blocked by RLS, or
    // the status already moved on) comes back as an error instead of
    // looking like success.
    const { error } = await createClient()
      .from("jobs")
      .update({ status: "cancelled", cancel_reason: cancelReason || null })
      .eq("id", jobId)
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast("Couldn't cancel this booking — " + error.message, "error");
      return;
    }
    await load();
    setShowCancel(false);
    toast("Booking cancelled", "success");
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!job?.provider_id || !user) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("reviews").insert({
      job_id: jobId,
      customer_id: user.id,
      provider_id: job.provider_id,
      rating,
      comment: comment || null,
    });
    await supabase.from("jobs").update({ status: "rated" }).eq("id", jobId);
    await load();
    setBusy(false);
  }

  if (loading || fetching) {
    return (
      <AppShell>
        <Spinner label="Loading booking…" />
      </AppShell>
    );
  }
  if (!job) {
    return (
      <AppShell>
        <Card className="text-center">
          <p className="text-muted-foreground">Booking not found.</p>
          <LinkButton href="/bookings" variant="ghost" size="sm" className="mt-4">
            Back to my bookings
          </LinkButton>
        </Card>
      </AppShell>
    );
  }

  const canCancel = ["created", "bidding", "assigned"].includes(job.status);
  const canReview = job.status === "paid" && !hasReview && job.provider_id;
  const awaitingPayment = job.status === "completed";
  const isLive = ["en_route", "arrived", "in_progress"].includes(job.status);
  const isOver = ["cancelled", "disputed"].includes(job.status);

  return (
    <AppShell>
      {isNew && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-success-light p-4 text-sm font-semibold text-success">
          <Icon name="check" size="sm" />
          Booking placed!{" "}
          {job.type === "custom" ? "Pros will send quotes shortly." : "We're finding you a pro."}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight">{job.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{job.address}</p>
        </div>
        <div className="text-right">
          {job.type === "custom" && <Pill tone="warn">Custom</Pill>}
          <p className="mt-2 text-xl font-extrabold">{formatPKR(job.price)}</p>
          <p className="text-xs text-muted-foreground">Cash on completion</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* ---------- left column ---------- */}
        <div className="flex flex-col gap-5">
          {/* Live tracking */}
          {job.provider_id && isLive && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">Live tracking</h2>
                <Pill tone="ok">
                  <span className="live" /> Live
                </Pill>
              </div>
              <TrackingMap
                jobId={jobId}
                destination={
                  job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null
                }
              />
            </Card>
          )}

          {/* Status */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">Progress</h2>
              <Pill tone={isOver ? "bad" : job.status === "rated" ? "ok" : "info"}>
                {JOB_STATUS_LABEL[job.status]}
              </Pill>
            </div>
            <JobTimeline status={job.status} />
          </Card>

          {/* Quotes (custom job, still collecting) */}
          {job.type === "custom" && job.status === "bidding" && (
            <Card>
              <h2 className="text-base font-bold">Quotes from pros</h2>
              {bids.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No quotes yet — check back shortly.
                </p>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  {bids.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                      <Avatar name={b.pro?.full_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/providers/view/?id=${b.provider_id}`}
                          className="font-semibold hover:text-primary"
                        >
                          {b.pro?.full_name ?? "Pro"}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          <Rating value={b.rating} />
                          {b.eta_minutes ? ` · ETA ${b.eta_minutes} min` : ""}
                        </p>
                        {b.note && <p className="mt-1 text-sm text-muted-foreground">{b.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatPKR(b.amount)}</p>
                        <Button size="sm" className="mt-1" disabled={busy} onClick={() => acceptBid(b)}>
                          Accept
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Chat */}
          {job.provider_id && user && (
            <Card>
              <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
                <Icon name="chat" size="sm" /> Messages
              </h2>
              <JobChat jobId={jobId} userId={user.id} />
            </Card>
          )}
        </div>

        {/* ---------- right column ---------- */}
        <div className="flex flex-col gap-5">
          {/* Pro card */}
          {providerProfile && (
            <Card>
              <div className="flex items-center gap-3">
                <Avatar name={providerProfile.full_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/providers/view/?id=${job.provider_id}`}
                    className="block truncate font-bold hover:text-primary"
                  >
                    {providerProfile.full_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    <Rating value={providerRating} />
                  </p>
                  <Pill tone="ok" icon="shield" className="mt-1">
                    Verified
                  </Pill>
                </div>
              </div>
              {providerProfile.phone && (
                <a href={`tel:${providerProfile.phone}`} className="btn-primary mt-4 w-full">
                  <Icon name="phone" size="sm" /> Call
                </a>
              )}
            </Card>
          )}

          {/* Details */}
          <Card>
            <h2 className="mb-2 text-base font-bold">Booking details</h2>
            <KV label="Status">{JOB_STATUS_LABEL[job.status]}</KV>
            <KV label="When">
              {job.scheduled_at
                ? new Date(job.scheduled_at).toLocaleString("en-PK")
                : "No time set"}
            </KV>
            <KV label="Address">{job.address}</KV>
            <KV label="Type">{job.type === "custom" ? "Custom job" : "Fixed price"}</KV>
            <KV label="Price">{formatPKR(job.price)}</KV>
            {job.description && (
              <>
                <div className="sep" />
                <p className="text-xs font-semibold text-muted-foreground">Your notes</p>
                <p className="mt-1 text-sm">{job.description}</p>
              </>
            )}
          </Card>

          {/* Awaiting payment */}
          {awaitingPayment && (
            <Card className="bg-warning-light">
              <p className="text-sm text-warning-foreground">
                Work completed. Please pay <strong>{formatPKR(job.price)}</strong> in cash. Once your
                pro confirms payment, you can leave a rating.
              </p>
            </Card>
          )}

          {/* Rating */}
          {canReview && (
            <Card>
              <h2 className="text-base font-bold">Rate your pro</h2>
              <form onSubmit={submitReview} className="mt-3 space-y-3">
                <div className="rate flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      className={clsx(n <= rating && "on")}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <Textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="How was the service? (optional)"
                  aria-label="Review comment"
                />
                <Button type="submit" disabled={busy} className="w-full">
                  Submit rating
                </Button>
              </form>
            </Card>
          )}

          {/* Cancel */}
          {canCancel && (
            <>
              {showCancel ? (
                <Card>
                  <p className="text-sm font-semibold">Why are you cancelling?</p>
                  <div className="mt-3">
                    <Select
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      aria-label="Cancellation reason"
                    >
                      <option value="">Select a reason…</option>
                      {CANCEL_REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="danger" size="sm" className="flex-1" disabled={busy} onClick={cancelJob}>
                      Confirm cancellation
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowCancel(false)}>
                      Keep booking
                    </Button>
                  </div>
                </Card>
              ) : (
                <Button variant="danger" size="sm" onClick={() => setShowCancel(true)}>
                  Cancel booking
                </Button>
              )}
            </>
          )}

          {user && job.provider_id && <DisputeButton jobId={jobId} userId={user.id} />}
        </div>
      </div>
    </AppShell>
  );
}

export default function BookingDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <Spinner label="Loading…" />
        </AppShell>
      }
    >
      <BookingDetailContent />
    </Suspense>
  );
}
