"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { JobChat } from "@/components/JobChat";
import { ProviderTracker } from "@/components/maps/ProviderTracker";
import { TrackingMap } from "@/components/maps/TrackingMap";
import { Directions } from "@/components/maps/JobsMapParts";
import { useRouteToJob } from "@/components/maps/useRouteToJob";
import { googleDirectionsUrl, type LatLng } from "@/lib/maps";
import { DisputeButton } from "@/components/DisputeButton";
import { Icon } from "@/components/Icon";
import { clsx } from "@/lib/clsx";
import {
  Avatar,
  Button,
  Card,
  Input,
  KV,
  LinkButton,
  Pill,
  Rating,
  Spinner,
  formatPKR,
} from "@/components/ui";
import {
  JOB_STATUS_LABEL,
  type CustomerReview,
  type Job,
  type JobStatus,
  type Profile,
  type PublicCustomerRating,
} from "@/lib/types";

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
  // Provider -> customer rating: whether this job already has one, and the
  // customer's running average.
  const [myRating, setMyRating] = useState<CustomerReview | null>(null);
  const [custRating, setCustRating] = useState<PublicCustomerRating | null>(null);
  const [stars, setStars] = useState(0);
  const [rateNote, setRateNote] = useState("");
  // In-app routing, shared with /pro/map.
  const route = useRouteToJob();
  // Set from <Directions>'s onError — an event callback, not an effect. Once
  // the Directions API has refused, stop offering the in-app route.
  const [inAppBroken, setInAppBroken] = useState(false);
  // The position already being shared through job_tracking, if any — routing
  // from it avoids asking for location permission a second time.
  const livePos = useRef<LatLng | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
    const j = data as Job | null;
    setJob(j);
    if (j) {
      const [{ data: cust }, { data: mine }, { data: rating }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", j.customer_id).maybeSingle(),
        supabase.from("customer_reviews").select("*").eq("job_id", j.id).maybeSingle(),
        // The view, not `customers` — that table holds the address and
        // coordinates, so ratings go out through the aggregates only.
        supabase
          .from("public_customer_ratings")
          .select("*")
          .eq("id", j.customer_id)
          .maybeSingle(),
      ]);
      setCustomer(cust as Profile | null);
      setMyRating(mine as CustomerReview | null);
      setCustRating(rating as PublicCustomerRating | null);
    }
    setFetching(false);
  }, [jobId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function submitCustomerRating() {
    if (!job || !user || !stars) return;
    setBusy(true);
    // Note: no jobs.status write. 'rated' is terminal in the status machine
    // and the customer's own review already sets it — this rating is
    // deliberately independent of it.
    const { error } = await createClient().from("customer_reviews").insert({
      job_id: job.id,
      provider_id: user.id,
      customer_id: job.customer_id,
      rating: stars,
      comment: rateNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast(
        error.code === "23505" || /duplicate|unique/i.test(error.message)
          ? "You've already rated this customer."
          : `Couldn't save your rating — ${error.message}`,
        "error"
      );
      return;
    }
    toast("Thanks — your rating helps other pros.", "success");
    setRateNote("");
    setStars(0);
    await load();
  }

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
  const canRateCustomer =
    !myRating && ["completed", "paid", "rated"].includes(job.status) && !!job.customer_id;
  const pin: LatLng | null =
    job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null;
  // "" when there is neither a pin nor an address, so the link hides itself.
  const directionsHref = googleDirectionsUrl(pin, { address: job.address });

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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold">Live location</h2>
                <div className="flex items-center gap-2">
                  {route.active && (
                    <span className="text-sm font-semibold">
                      {route.route
                        ? `${route.route.distance} · ${route.route.duration}`
                        : "Finding route…"}
                    </span>
                  )}
                  <Pill tone="ok">
                    <span className="live" /> Sharing
                  </Pill>
                </div>
              </div>

              {/* Google Maps leads here too: it needs neither the Directions
                  API nor a location prompt. Drawing the route on this map is
                  the extra, and it removes itself once the API refuses. */}
              <div className="mb-3 flex flex-wrap gap-2">
                {directionsHref && (
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener"
                    className="btn-primary btn-sm"
                  >
                    <Icon name="navigate" size="sm" /> Open in Google Maps
                  </a>
                )}
                {pin &&
                  !inAppBroken &&
                  (route.active ? (
                    <Button size="sm" variant="ghost" onClick={route.clearRoute}>
                      <Icon name="x" size="sm" /> Clear route
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={route.locating}
                      onClick={() => route.startDirections(pin, livePos.current)}
                    >
                      <Icon name="send" size="sm" />
                      {route.locating ? "Locating…" : "Show route here"}
                    </Button>
                  ))}
              </div>

              <ProviderTracker jobId={jobId} autoStart={job.status === "en_route"} />
              <div className="mt-3">
                <TrackingMap
                  jobId={jobId}
                  destination={pin}
                  audience="provider"
                  onProPos={(p) => {
                    livePos.current = p;
                  }}
                >
                  <Directions
                    origin={route.origin}
                    destination={route.destination}
                    onResult={route.onResult}
                    onError={(message) => {
                      setInAppBroken(true);
                      route.onError(message);
                    }}
                  />
                </TrackingMap>
              </div>

              {route.routeError && (
                <div className="mt-3 rounded-xl bg-warning-light p-3">
                  <p className="text-sm text-warning-foreground">{route.routeError}</p>
                  {/* Never a dead end — the external link needs none of what
                      just failed. */}
                  {directionsHref && (
                    <a
                      href={directionsHref}
                      target="_blank"
                      rel="noopener"
                      className="btn-primary btn-sm mt-3"
                    >
                      <Icon name="navigate" size="sm" /> Open in Google Maps instead
                    </a>
                  )}
                </div>
              )}
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

          {/* Rate the customer — available from 'completed' on, and still
              available at 'rated' if the customer reviewed first. */}
          {canRateCustomer && (
            <Card>
              <h2 className="text-base font-bold">Rate this customer</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                How was the job? Other pros see this before they accept.
              </p>
              <div className="rate mt-3 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    aria-pressed={stars === n}
                    className={clsx(n <= stars && "on")}
                  >
                    ★
                  </button>
                ))}
              </div>
              <Input
                className="mt-3"
                value={rateNote}
                onChange={(e) => setRateNote(e.target.value)}
                placeholder="Anything worth noting? (optional)"
                aria-label="Comment about this customer"
              />
              <Button
                className="mt-3 w-full"
                disabled={!stars || busy}
                onClick={submitCustomerRating}
              >
                {busy ? "Saving…" : "Submit rating"}
              </Button>
            </Card>
          )}

          {myRating && (
            <Card className="bg-success-light">
              <p className="text-sm font-semibold text-success">
                You rated this customer {myRating.rating} / 5.
              </p>
              {myRating.comment && (
                <p className="mt-1 text-xs text-muted-foreground">“{myRating.comment}”</p>
              )}
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
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {custRating && custRating.jobs_rated > 0 ? (
                      <>
                        <Rating value={custRating.rating_avg} /> · {custRating.jobs_rated}{" "}
                        {custRating.jobs_rated === 1 ? "rating" : "ratings"}
                      </>
                    ) : (
                      "New customer"
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="btn-primary btn-sm flex-1">
                    <Icon name="phone" size="sm" /> Call
                  </a>
                )}
                <a
                  className="btn-ghost btn-sm flex-1"
                  target="_blank"
                  rel="noopener"
                  href={googleDirectionsUrl(pin, { address: job.address })}
                >
                  <Icon name="navigate" size="sm" /> Directions
                </a>
              </div>
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
