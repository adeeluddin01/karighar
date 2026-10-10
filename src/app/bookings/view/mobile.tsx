"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { useToast } from "@/components/Toast";
import { Screen, Scroll, TopBar, Cta } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Ava, EmptyK, Pill, Skel, Well } from "@/components/kg/parts";
import { TrackMap } from "@/components/kg/TrackMap";
import { ChatSheet } from "@/components/kg/ChatSheet";
import { ReportSheet } from "@/components/kg/ReportSheet";
import { STATUS_PILL, jobRef, scheduleLabel, whenLabel } from "@/components/kg/job";
import { fetchPublicPros } from "@/lib/providers";
import { formatPKR } from "@/lib/money";
import { JOB_STATUS_LABEL, type Bid, type Job, type Profile } from "@/lib/types";
import { clsx } from "@/lib/clsx";

type BidWithPro = Bid & { proName?: string | null; rating?: number | null };

/* The redesign's five-step rail, mapped onto the job state machine. */
const STEPS = ["Accepted", "On the way", "Arrived", "Working", "Done"] as const;
const STEP_OF: Partial<Record<Job["status"], number>> = {
  assigned: 0,
  en_route: 1,
  arrived: 2,
  in_progress: 3,
  completed: 4,
  paid: 4,
  rated: 4,
};

const CANCEL_REASONS = [
  "Changed my mind",
  "Booked by mistake",
  "Found another provider",
  "Pro not responding",
  "Scheduling conflict",
  "Other",
];

const RATING_WORD = ["Poor", "Fair", "Good", "Great", "Excellent"];
const REVIEW_TAGS = [
  "On time",
  "Polite",
  "Clean work",
  "Fixed properly",
  "Fair price",
  "Explained the issue",
];
const TIPS = [0, 100, 200, 500];

/** Whole minutes from `now` until `scheduledAt`, or null if that's not useful. */
function etaMinutes(scheduledAt: string | null | undefined, now: number | null) {
  if (!scheduledAt || now === null) return null;
  const mins = Math.round((new Date(scheduledAt).getTime() - now) / 60_000);
  return mins > 0 && mins < 600 ? mins : null;
}

function BookingContent() {
  const search = useSearchParams();
  const jobId = search.get("id") ?? "";
  const isNew = search.get("new") === "1";
  const { user, loading } = useRequireAuth(`/bookings/view/?id=${jobId}`);
  const toast = useToast();

  const [job, setJob] = useState<Job | null>(null);
  const [pro, setPro] = useState<Profile | null>(null);
  const [proRating, setProRating] = useState<number | null>(null);
  const [bids, setBids] = useState<BidWithPro[]>([]);
  const [hasReview, setHasReview] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState(false);
  const [report, setReport] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [sharingLive, setSharingLive] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  // Rate screen state
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [tip, setTip] = useState(0);

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
      const [{ data: prof }, prov] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", j.provider_id).single(),
        fetchPublicPros(supabase, { id: j.provider_id }),
      ]);
      setPro(prof as Profile | null);
      setProRating(prov.pros[0] ? prov.pros[0].rating_avg : null);
    }

    if (j.type === "custom" && j.status === "bidding") {
      const { data: bidData } = await supabase
        .from("bids")
        .select("*")
        .eq("job_id", jobId)
        .eq("status", "pending")
        .order("amount");
      const list = (bidData as Bid[]) ?? [];
      const proIds = [...new Set(list.map((b) => b.provider_id))];
      const { pros: bidders } = await fetchPublicPros(supabase, { ids: proIds });
      const byId = new Map(bidders.map((p) => [p.id, p]));
      setBids(
        list.map((b) => ({
          ...b,
          proName: byId.get(b.provider_id)?.full_name ?? null,
          rating: byId.get(b.provider_id) ? Number(byId.get(b.provider_id)!.rating_avg) : null,
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
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`kg-job:${jobId}`)
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

  /* ---------------- actions ---------------- */

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
    setCancelling(false);
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

  async function submitReview() {
    if (!job?.provider_id || !user || !stars) return;
    setBusy(true);
    const supabase = createClient();
    // There's no tags/tip column, so both fold into the review text — which
    // is what another customer actually reads.
    const body = [
      tags.length ? tags.join(" · ") : "",
      comment.trim(),
      tip ? `Tipped ${formatPKR(tip)} in cash.` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const { error } = await supabase.from("reviews").insert({
      job_id: jobId,
      customer_id: user.id,
      provider_id: job.provider_id,
      rating: stars,
      comment: body || null,
    });
    if (error) {
      setBusy(false);
      toast("Couldn't submit your review — " + error.message, "error");
      return;
    }
    await supabase.from("jobs").update({ status: "rated" }).eq("id", jobId);
    await load();
    setBusy(false);
    toast("Thanks for rating your pro", "success");
  }

  /* ---------------- derived ---------------- */

  const proFirst = (pro?.full_name ?? "").trim().split(/\s+/)[0] || "Your pro";

  // Minutes until the booked window, while the pro is still on the way. The
  // clock lives in state (and reads null before hydration) so render stays
  // pure and the countdown actually ticks down while the screen is open.
  const etaMins = etaMinutes(job?.scheduled_at, now);

  if (loading || fetching) {
    return (
      <Screen>
        <TopBar title="Booking" back="/bookings" />
        <Scroll underTop pad="plain">
          <Skel h={120} />
          <Skel h={180} />
        </Scroll>
      </Screen>
    );
  }

  if (!job) {
    return (
      <Screen>
        <TopBar title="Booking" back="/bookings" />
        <Scroll underTop pad="plain">
          <EmptyK
            icon="search"
            title="Booking not found"
            hint="It may have been removed, or the link is wrong."
          >
            <Link className="btn sm" href="/bookings" style={{ marginTop: 10 }}>
              My bookings
            </Link>
          </EmptyK>
        </Scroll>
      </Screen>
    );
  }

  const pill = STATUS_PILL[job.status];
  const step = STEP_OF[job.status];
  const tracking = ["assigned", "en_route", "arrived", "in_progress"].includes(job.status);
  const finding = job.status === "created" || job.status === "bidding";
  const paying = job.status === "completed";
  const rating = job.status === "paid" && !hasReview && !!job.provider_id;

  const chatSheet =
    chat && user && job.provider_id ? (
      <ChatSheet
        jobId={jobId}
        userId={user.id}
        withName={pro?.full_name}
        onClose={() => setChat(false)}
      />
    ) : null;

  const reportSheet =
    report && user ? (
      <ReportSheet jobId={jobId} userId={user.id} onClose={() => setReport(false)} />
    ) : null;

  const cancelSheet = cancelling ? (
    <div
      className="over"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setCancelling(false);
      }}
    >
      <div className="over-card" role="dialog" aria-modal="true" aria-label="Cancel booking">
        <span className="grab" />
        <div className="sh-head">
          <div>
            <h2 style={{ fontSize: 19 }}>Cancel this booking?</h2>
            <small>No charge. Tell us why so we can improve.</small>
          </div>
          <button
            type="button"
            className="ic sm"
            onClick={() => setCancelling(false)}
            aria-label="Keep booking"
          >
            <KIcon name="x" />
          </button>
        </div>
        <div className="chips wrap" role="radiogroup" aria-label="Reason">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={cancelReason === r}
              className={clsx("chip", cancelReason === r && "sel")}
              onClick={() => setCancelReason(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn ghost"
            style={{ flex: 1 }}
            onClick={() => setCancelling(false)}
          >
            Keep it
          </button>
          <button
            type="button"
            className="btn"
            style={{ flex: 1, background: "var(--bad)" }}
            disabled={busy}
            onClick={cancelJob}
          >
            {busy ? "Cancelling…" : "Cancel booking"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* ================= LIVE TRACKING ================= */
  if (tracking) {
    return (
      <Screen>
        <div className="map">
          <TrackMap
            jobId={jobId}
            destination={job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null}
            onProPos={(p) => setSharingLive(!!p)}
          />
          <div className="map-top">
            <Link className="ic" href="/bookings" aria-label="Back">
              <KIcon name="chev-l" />
            </Link>
            <div className="in pillin center">
              <span>Booking {jobRef(job.id)}</span>
            </div>
            <button
              type="button"
              className="ic"
              onClick={() => setChat(true)}
              aria-label="Message your pro"
            >
              <KIcon name="chat" />
            </button>
          </div>
        </div>

        <div className="sheet track">
          <span className="grab" />

          <div className="eta">
            <div>
              <span className="eyebrow">{pill.label}</span>
              <h2>
                {job.status === "assigned" && `${proFirst} is assigned`}
                {job.status === "en_route" && `${proFirst} is on the way`}
                {job.status === "arrived" && `${proFirst} has arrived`}
                {job.status === "in_progress" && `${proFirst} is working`}
              </h2>
              <small>
                {scheduleLabel(job)} · {job.address}
              </small>
            </div>
            {etaMins !== null && job.status !== "in_progress" && (
              <div className="eta-n">
                <b>{etaMins}</b>
                <small>min</small>
              </div>
            )}
          </div>

          <ol
            className="steps"
            aria-label="Booking progress"
            style={{ ["--i" as string]: step ?? 0 }}
          >
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={clsx(i < (step ?? 0) && "done", i === step && "now")}
                aria-current={i === step ? "step" : undefined}
              >
                <i>
                  {i < (step ?? 0) && (
                    <KIcon name="check" xs className="kg-tick" />
                  )}
                </i>
                {s}
              </li>
            ))}
          </ol>

          {pro ? (
            <div className="pro-row card">
              <Ava name={pro.full_name} size="lg" verified />
              <div>
                <b>{pro.full_name ?? "Your pro"}</b>
                <small>
                  {proRating ? `${proRating.toFixed(1)} rating · ` : ""}CNIC verified
                </small>
              </div>
              {pro.phone && (
                <a className="ic ok" href={`tel:${pro.phone}`} aria-label={`Call ${proFirst}`}>
                  <KIcon name="phone" />
                </a>
              )}
              <button
                type="button"
                className="ic"
                onClick={() => setChat(true)}
                aria-label={`Message ${proFirst}`}
              >
                <KIcon name="chat" />
              </button>
            </div>
          ) : (
            <div className="pro-row card">
              <div className="spin" />
              <div>
                <b>Matching you with a pro</b>
                <small>We&rsquo;ll show their details the moment one accepts.</small>
              </div>
            </div>
          )}

          <div className="otp">
            <div>
              <small>Booking code</small>
              <b>{jobRef(job.id).replace("KG-", "")}</b>
            </div>
            <small>
              {sharingLive
                ? `${proFirst} is sharing their location live. Quote this code so you're both on the same job.`
                : `Quote this code to ${proFirst} so you're both on the same job.`}
            </small>
          </div>

          <div className="row-links">
            {job.status === "assigned" ? (
              <button type="button" className="link mute" onClick={() => setCancelling(true)}>
                Cancel booking
              </button>
            ) : (
              <button type="button" className="link mute" onClick={() => setReport(true)}>
                <KIcon name="alert" xs />
                Report an issue
              </button>
            )}
            <span className="link">
              {job.price === null ? "On quote" : formatPKR(job.price)} · pay in cash
            </span>
          </div>
        </div>

        {chatSheet}
        {reportSheet}
        {cancelSheet}
      </Screen>
    );
  }

  /* ================= FINDING A PRO / QUOTES ================= */
  if (finding) {
    return (
      <Screen>
        <TopBar
          title={job.type === "custom" ? "Your quotes" : "Finding a pro"}
          back="/bookings"
          action={
            <Link className="ic" href="/support" aria-label="Help">
              <KIcon name="info" />
            </Link>
          }
        />
        <Scroll underTop pad="plain">
          {isNew && (
            <div className="note">
              <KIcon name="check" />
              <p>
                <b>Booking placed.</b>{" "}
                {job.type === "custom"
                  ? "Nearby pros will send you quotes shortly."
                  : "We're matching you with a verified pro nearby."}
              </p>
            </div>
          )}

          <div className="done-head">
            <span className="check">
              <div className="spin" />
            </span>
            <h2>{JOB_STATUS_LABEL[job.status]}</h2>
            <small>
              {job.title} · {scheduleLabel(job)}
            </small>
          </div>

          <ol className="steps" aria-label="Booking progress" style={{ ["--i" as string]: 0 }}>
            {STEPS.map((s, i) => (
              <li key={s} className={clsx(i === 0 && "now")}>
                <i />
                {s}
              </li>
            ))}
          </ol>

          {job.type === "custom" && (
            <>
              <h3 className="lbl">
                {bids.length ? `${bids.length} quote${bids.length > 1 ? "s" : ""}` : "Quotes"}
              </h3>
              {bids.length === 0 ? (
                <div className="note">
                  <KIcon name="clock" />
                  <p>
                    <b>No quotes yet.</b> Pros near you have been notified — this usually takes a
                    few minutes.
                  </p>
                </div>
              ) : (
                <div className="opts">
                  {bids.map((b) => (
                    <div key={b.id} className="opt">
                      <Ava name={b.proName} />
                      <div>
                        <b>{b.proName ?? "Pro"}</b>
                        <small>
                          {b.rating ? `${b.rating.toFixed(1)} ★` : "New pro"}
                          {b.eta_minutes ? ` · can be there in ${b.eta_minutes} min` : ""}
                        </small>
                        {b.note && <small>{b.note}</small>}
                      </div>
                      <div style={{ flex: "none", textAlign: "right" }}>
                        <em style={{ display: "block" }}>{formatPKR(b.amount)}</em>
                        <button
                          type="button"
                          className="btn sm"
                          style={{ marginTop: 6 }}
                          disabled={busy}
                          onClick={() => acceptBid(b)}
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <h3 className="lbl">Booking details</h3>
          <Details job={job} />

          <button
            type="button"
            className="link mute kg-self-center"
            onClick={() => setCancelling(true)}
          >
            Cancel booking
          </button>
        </Scroll>
        {cancelSheet}
      </Screen>
    );
  }

  /* ================= PAYMENT ================= */
  if (paying) {
    return (
      <Screen>
        <TopBar
          title="Payment"
          back="/bookings"
          action={
            <button
              type="button"
              className="ic"
              onClick={() => setChat(true)}
              aria-label="Message your pro"
            >
              <KIcon name="chat" />
            </button>
          }
        />
        <Scroll underTop pad="cta">
          <div className="done-head">
            <span className="check">
              <KIcon name="check" />
            </span>
            <h2>Job completed</h2>
            <small>
              {job.title} · {whenLabel(job)}
              {pro?.full_name ? ` · ${pro.full_name}` : ""}
            </small>
          </div>

          <Bill job={job} />

          <h3 className="lbl">Pay with</h3>
          <div className="opts" role="radiogroup" aria-label="Payment method">
            <div className="opt sel" role="radio" aria-checked="true" tabIndex={0}>
              <span className="rad" />
              <Well icon="cash" size="sm" />
              <div>
                <b>Cash on completion</b>
                <small>Hand {proFirst} the cash. Confirming here closes the job.</small>
              </div>
            </div>
            {[
              { label: "JazzCash", sub: "Mobile wallet", badge: "JC" as const },
              { label: "EasyPaisa", sub: "Mobile wallet", badge: "EP" as const },
            ].map((m) => (
              <div key={m.label} className="opt off" aria-disabled="true">
                <span className="rad" />
                <Well size="sm">{m.badge}</Well>
                <div>
                  <b>{m.label}</b>
                  <small>{m.sub}</small>
                </div>
                <Pill tone="soon">Soon</Pill>
              </div>
            ))}
            <div className="opt off" aria-disabled="true">
              <span className="rad" />
              <Well icon="card" size="sm" />
              <div>
                <b>Debit or credit card</b>
                <small>Visa, Mastercard</small>
              </div>
              <Pill tone="soon">Soon</Pill>
            </div>
          </div>

          <div className="note">
            <KIcon name="shield" />
            <p>
              <b>You only pay once the work is done.</b> Not fixed properly? Report it within 48
              hours and we&rsquo;ll make it right.
            </p>
          </div>

          <button
            type="button"
            className="link bad kg-self-center"
            onClick={() => setReport(true)}
          >
            <KIcon name="alert" xs />
            Not fixed properly? Report an issue
          </button>
        </Scroll>

        <Cta>
          <div>
            <small>Paying in cash</small>
            <b>{job.price === null ? "On quote" : formatPKR(job.price)}</b>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={confirmPaid}>
            {busy ? "Saving…" : "Confirm paid"}
            <KIcon name="check" />
          </button>
        </Cta>

        {chatSheet}
        {reportSheet}
      </Screen>
    );
  }

  /* ================= RATE ================= */
  if (rating) {
    return (
      <Screen>
        <TopBar title="Rate your pro" back="/bookings" backIcon="x" backLabel="Close" />
        <Scroll underTop pad="cta">
          <div className="rate-head">
            <Ava name={pro?.full_name} size="xl" verified />
            <h2>How was {proFirst}&rsquo;s work?</h2>
            <small>
              {job.title} ·{" "}
              {job.price === null ? "paid in cash" : `${formatPKR(job.price)} paid in cash`}
            </small>
          </div>

          <div className="stars" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={clsx(n <= stars && "lit")}
                onClick={() => setStars(n)}
              >
                <KIcon name="star" />
              </button>
            ))}
          </div>
          <div className="stars-lbl" aria-live="polite">
            {stars ? RATING_WORD[stars - 1] : "Tap to rate"}
          </div>

          <div className="chips wrap" aria-label="What went well">
            {REVIEW_TAGS.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  className={clsx("chip", on && "sel")}
                  onClick={() => setTags((list) => (on ? list.filter((x) => x !== t) : [...list, t]))}
                >
                  {t}
                </button>
              );
            })}
          </div>

          <textarea
            className="ta"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell other customers what went well…"
            aria-label="Your review"
          />

          <h3 className="lbl">Add a tip for {proFirst}?</h3>
          <div className="chips" role="radiogroup" aria-label="Tip">
            {TIPS.map((amount) => (
              <button
                key={amount}
                type="button"
                role="radio"
                aria-checked={tip === amount}
                className={clsx("chip", tip === amount && "sel")}
                onClick={() => setTip(amount)}
              >
                {amount === 0 ? "No tip" : formatPKR(amount)}
              </button>
            ))}
          </div>
          {tip > 0 && (
            <small>
              Hand {proFirst} the tip in cash — we&rsquo;ll note it on your review so other
              customers see it.
            </small>
          )}

          <button
            type="button"
            className="link bad kg-self-center"
            onClick={() => setReport(true)}
          >
            <KIcon name="alert" xs />
            Not fixed properly? Report an issue
          </button>
        </Scroll>

        <Cta>
          <button
            type="button"
            className="btn wide"
            disabled={!stars || busy}
            onClick={submitReview}
          >
            {busy ? "Submitting…" : "Submit review"}
          </button>
        </Cta>

        {reportSheet}
      </Screen>
    );
  }

  /* ================= RECEIPT / CLOSED ================= */
  const bad = job.status === "cancelled" || job.status === "disputed";
  return (
    <Screen>
      <TopBar
        title="Booking"
        back="/bookings"
        action={
          job.provider_id ? (
            <button
              type="button"
              className="ic"
              onClick={() => setChat(true)}
              aria-label="Message your pro"
            >
              <KIcon name="chat" />
            </button>
          ) : undefined
        }
      />
      <Scroll underTop pad="cta">
        <div className="done-head">
          <span
            className="check"
            style={bad ? { background: "var(--bad-tint)", color: "var(--bad)" } : undefined}
          >
            <KIcon name={bad ? "x" : "check"} />
          </span>
          <h2>{bad ? pill.label : "All done"}</h2>
          <small>
            {job.title} · {whenLabel(job)}
            {pro?.full_name ? ` · ${pro.full_name}` : ""}
          </small>
          <Pill tone={pill.tone} icon={pill.icon}>
            {pill.label}
          </Pill>
        </div>

        {job.status === "cancelled" ? (
          <div className="note bad">
            <KIcon name="info" />
            <p>
              <b>This booking was cancelled</b>
              {job.cancel_reason ? ` — ${job.cancel_reason}.` : "."} You weren&rsquo;t charged.
            </p>
          </div>
        ) : job.status === "disputed" ? (
          <div className="note warn">
            <KIcon name="alert" />
            <p>
              <b>Reported.</b> Our support team is looking into this booking and will be in touch.
            </p>
          </div>
        ) : (
          <Bill job={job} />
        )}

        {hasReview && (
          <div className="note">
            <KIcon name="star" />
            <p>
              <b>You rated this pro.</b> Thanks — reviews are what keep Karighar&rsquo;s pros
              accountable.
            </p>
          </div>
        )}

        <h3 className="lbl">Booking details</h3>
        <Details job={job} />

        {!bad && user && (
          <button
            type="button"
            className="link bad kg-self-center"
            onClick={() => setReport(true)}
          >
            <KIcon name="alert" xs />
            Something wrong with this job? Report it
          </button>
        )}
      </Scroll>

      <Cta>
        <div>
          <small>{bad ? "No charge" : "Paid in cash"}</small>
          <b>{bad || job.price === null ? "—" : formatPKR(job.price)}</b>
        </div>
        <Link className="btn" href="/book">
          Book again
          <KIcon name="arrow" />
        </Link>
      </Cta>

      {chatSheet}
      {reportSheet}
    </Screen>
  );
}

/* ---------------- shared blocks ---------------- */

function Bill({ job }: { job: Job }) {
  return (
    <div className="bill card">
      <div className="row">
        <div>
          <b>{job.title}</b>
          <small>{job.type === "custom" ? "Agreed quote" : "Fixed Karachi rate"}</small>
        </div>
        <em>{job.price === null ? "On quote" : formatPKR(job.price)}</em>
      </div>
      <div className="row">
        <div>
          <b>Platform fee</b>
          <small>Karighar charges the pro, never you</small>
        </div>
        <em className="ok-txt">Free</em>
      </div>
      <div className="row total">
        <b>Total</b>
        <em>{job.price === null ? "On quote" : formatPKR(job.price)}</em>
      </div>
    </div>
  );
}

function Details({ job }: { job: Job }) {
  return (
    <div className="bill card">
      <div className="row">
        <div>
          <b>Reference</b>
        </div>
        <em style={{ fontSize: 14 }}>{jobRef(job.id)}</em>
      </div>
      <div className="row">
        <div>
          <b>When</b>
        </div>
        <small style={{ textAlign: "right" }}>{scheduleLabel(job)}</small>
      </div>
      <div className="row">
        <div>
          <b>Where</b>
        </div>
        <small style={{ textAlign: "right", maxWidth: "60%" }}>{job.address}</small>
      </div>
      <div className="row">
        <div>
          <b>Type</b>
        </div>
        <small style={{ textAlign: "right" }}>
          {job.type === "custom" ? "Custom job · on quote" : "Fixed price"}
        </small>
      </div>
      {job.description && (
        <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div>
            <b>Your notes</b>
            <small>{job.description}</small>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookingDetailPage() {
  return (
    <Suspense
      fallback={
        <Screen>
          <Scroll pad="plain">
            <Skel h={120} />
            <Skel h={180} />
          </Scroll>
        </Screen>
      }
    >
      <BookingContent />
    </Suspense>
  );
}
