"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { googleDirectionsUrl } from "@/lib/maps";
import {
  businessName,
  dispatcherOf,
  fetchBusinessSummary,
  type BusinessSummary,
} from "@/lib/businesses";
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
  Input,
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
  const { user, profile, loading } = useRequireAuth(`/bookings/view/?id=${jobId}`);
  const router = useRouter();
  const toast = useToast();

  // Customer-area page: the read rules let a job's PROVIDER open this URL
  // too, which used to show them customer controls — Pay now, Confirm
  // paid, cancel, remove-the-pro. A provider belongs on their job view
  // for the same job; other roles go to their home.
  useEffect(() => {
    if (!loading && profile && profile.role !== "customer") {
      router.replace(
        profile.role === "provider"
          ? `/pro/jobs/view/?id=${jobId}`
          : profile.role === "business"
            ? "/business"
            : "/admin/jobs",
      );
    }
  }, [loading, profile, jobId, router]);

  const [job, setJob] = useState<Job | null>(null);
  const [providerProfile, setProviderProfile] = useState<Profile | null>(null);
  const [providerRating, setProviderRating] = useState<number | null>(null);
  // The dispatching company, when one sent this pro. Null for an
  // independent pro and on any database without business accounts.
  const [dispatcher, setDispatcher] = useState<BusinessSummary | null>(null);
  const [bids, setBids] = useState<BidWithPro[]>([]);
  const [hasReview, setHasReview] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [tip, setTip] = useState(0);
  const [showUnassign, setShowUnassign] = useState(false);
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
      // Only fires when a business actually dispatched the job.
      setDispatcher(await fetchBusinessSummary(supabase, dispatcherOf(j)));
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
    // Atomic award: job assignment + bid award/reject in one transaction.
    // The old three-update version could mark a bid awarded even when the
    // job update itself was rejected.
    const { error } = await createClient().rpc("customer_award_bid", {
      p_job: jobId,
      p_bid: bid.id,
    });
    setBusy(false);
    if (error) {
      toast("Couldn't accept that quote — " + error.message, "error");
      return;
    }
    await load();
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

  async function confirmPaid() {
    setBusy(true);
    const { error } = await createClient()
      .from("jobs")
      .update({ status: "paid" })
      .eq("id", jobId)
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast("Couldn't record the payment — " + error.message, "error");
      return;
    }
    await load();
    toast("Payment recorded. Thanks!", "success");
  }

  async function unassignPro() {
    setBusy(true);
    const { error } = await createClient().rpc("customer_unassign_pro", {
      p_job: jobId,
    });
    setBusy(false);
    if (error) {
      toast("Couldn't remove the pro — " + error.message, "error");
      return;
    }
    setShowUnassign(false);
    await load();
    toast("Pro removed — your job is open again.", "success");
  }

  async function acceptProposal() {
    if (!job?.proposed_price) return;
    setBusy(true);
    const { error } = await createClient()
      .from("jobs")
      .update({ price: job.proposed_price, proposed_price: null })
      .eq("id", jobId);
    setBusy(false);
    if (error) {
      toast("Couldn't accept the price — " + error.message, "error");
      return;
    }
    await load();
  }

  async function declineProposal() {
    setBusy(true);
    const { error } = await createClient()
      .from("jobs")
      .update({ proposed_price: null })
      .eq("id", jobId);
    setBusy(false);
    if (error) {
      toast("Couldn't decline the price — " + error.message, "error");
      return;
    }
    await load();
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!job?.provider_id || !user) return;
    setBusy(true);
    const supabase = createClient();
    const body = [
      comment.trim(),
      tip > 0 ? `Tipped ${formatPKR(tip)} in cash.` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const { error } = await supabase.from("reviews").insert({
      job_id: jobId,
      customer_id: user.id,
      provider_id: job.provider_id,
      rating,
      comment: body || null,
    });
    if (error) {
      setBusy(false);
      toast("Couldn't submit your review — " + error.message, "error");
      return;
    }
    // Only move to rated once the review actually saved. The old code
    // set rated unconditionally, which permanently lost the review on
    // any insert failure.
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
  if (profile && profile.role !== "customer") return null;
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

  const canCancel = ["created", "bidding", "assigned", "en_route", "arrived", "in_progress"].includes(
    job.status,
  );
  const canUnassign = job.status === "assigned" && !!job.provider_id;
  const canReview = job.status === "paid" && !hasReview && job.provider_id;
  const awaitingPayment = job.status === "completed";
  const isLive = ["en_route", "arrived", "in_progress"].includes(job.status);
  const isOver = ["cancelled", "disputed"].includes(job.status);
  // "" when there is neither a pin nor an address to route to, so the link hides.
  const directionsHref = googleDirectionsUrl(
    job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null,
    { address: job.address }
  );

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
        <div className="text-end">
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
                      <div className="text-end">
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
              {/* Who sent them, when a company did. `dispatcherOf` is null
                  for an independent pro AND on a database with no business
                  accounts at all, so this line simply never appears unless
                  one is genuinely involved. */}
              {dispatcher && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Assigned to you by{" "}
                  <Link
                    href={`/businesses/view/?id=${dispatcher.id}`}
                    className="font-semibold hover:text-primary"
                  >
                    {businessName(dispatcher)}
                  </Link>
                  {dispatcher.jobs_completed > 0 &&
                    ` · ${dispatcher.rating_avg.toFixed(1)}★ (${dispatcher.jobs_completed})`}
                </p>
              )}
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
            <KV label="Address">
              <span className="inline-flex flex-wrap items-baseline gap-x-2">
                {job.address}
                {directionsHref && (
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-primary"
                  >
                    Directions
                  </a>
                )}
              </span>
            </KV>
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
                Work completed. Please pay <strong>{formatPKR(job.price)}</strong> in cash. Confirming
                here records the payment — JazzCash, EasyPaisa and card are coming soon.
              </p>
              <Button className="mt-3" disabled={busy} onClick={confirmPaid}>
                Confirm paid
              </Button>
            </Card>
          )}

          {/* Price proposal: pro set a price on site, customer accepts it */}
          {job.proposed_price != null && job.price == null && (
            <Card className="bg-warning-light">
              <p className="text-sm font-semibold text-warning-foreground">
                Your pro proposed {formatPKR(job.proposed_price)} for this job.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Accepting makes this the final price. Declining lets the pro propose again — or
                remove the pro to reopen the job.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={busy} onClick={acceptProposal}>
                  Accept price
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={declineProposal}>
                  Decline
                </Button>
              </div>
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
                <Input
                  type="number"
                  inputMode="numeric"
                  value={tip || ""}
                  onChange={(e) => setTip(Number(e.target.value) || 0)}
                  prefix="Rs"
                  placeholder="Cash tip (optional)"
                  aria-label="Cash tip"
                />
                <Button type="submit" disabled={busy} className="w-full">
                  Submit rating
                </Button>
              </form>
            </Card>
          )}

          {/* Remove the assigned pro and reopen the job */}
          {canUnassign && (
            <>
              {showUnassign ? (
                <Card>
                  <p className="text-sm font-semibold">Remove this pro?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your job goes back to the open pool so another pro can take it. Nothing has
                    been paid yet, so no money moves.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="danger" size="sm" className="flex-1" disabled={busy} onClick={unassignPro}>
                      Remove pro and reopen job
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowUnassign(false)}>
                      Keep pro
                    </Button>
                  </div>
                </Card>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setShowUnassign(true)}>
                  Remove pro and reopen job
                </Button>
              )}
            </>
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
