"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Screen, Scroll, TopBar, Cta } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { EmptyK, Pill, Skel, Well } from "@/components/kg/parts";
import { MapArt } from "@/components/kg/MapArt";
import { categoryIcon } from "@/components/kg/catalogIcons";
import { MapPicker } from "@/components/maps/MapPicker";
import { AuthGateSheet } from "@/components/kg/AuthGateSheet";
import { formatPKR } from "@/lib/money";
import { KARACHI_AREAS, type Service, type ServiceCategory } from "@/lib/types";
import { joinAddress, splitAddress } from "@/lib/area";
import type { LatLng } from "@/lib/maps";
import { clsx } from "@/lib/clsx";

// Visit windows, kept 24h so `new Date(`${date}T${time}`)` still does the
// scheduling maths.
const SLOTS = [
  { value: "09:00", label: "9:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "19:00", label: "7:00 PM" },
];

type When = "asap" | "today" | "tomorrow" | "pick";

// Sentinel for the "Custom job" entry in the service radio group — picking it
// hands the booking over to the quote flow instead of placing a fixed job.
const CUSTOM = "custom";

// Persists the in-progress booking across a sign-in/sign-up detour so the
// form isn't lost — either in the inline modal or across a Google OAuth
// redirect (which necessarily leaves and returns to this page).
const DRAFT_KEY = "kg-draft-book-service";

type Draft = {
  serviceId: string;
  pickedId: string;
  when: When;
  area: string;
  address: string;
  pos: LatLng | null;
  date: string;
  time: string;
  notes: string;
};

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function nextDays(n = 7) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      iso: isoDay(d),
      day: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" }),
      num: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    };
  });
}

/** The first visit window still ahead of us today, if any. */
function slotLeftToday() {
  const now = new Date();
  return SLOTS.find((s) => Number(s.value.slice(0, 2)) > now.getHours() + 1) ?? null;
}

function fmtDay(iso: string) {
  return new Date(`${iso}T12:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Read-only: does not clear the draft, so it stays safe to call twice (React
// Strict Mode double-invokes lazy initializers).
function readDraft(serviceId: string): Draft | null {
  if (typeof window === "undefined" || !serviceId) return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    return draft.serviceId === serviceId ? draft : null;
  } catch {
    return null;
  }
}

function BookServiceContent() {
  const serviceId = useSearchParams().get("id") ?? "";
  const router = useRouter();

  // A draft left behind by a Google OAuth round-trip (same-tab sign-in never
  // needs this — the form is already sitting in React state).
  const [draft] = useState<Draft | null>(() => readDraft(serviceId));

  const [cat, setCat] = useState<ServiceCategory | null>(null);
  const [siblings, setSiblings] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickedId, setPickedId] = useState(draft?.pickedId ?? serviceId);
  const [when, setWhen] = useState<When>(draft?.when ?? "asap");
  const [area, setArea] = useState(draft?.area ?? KARACHI_AREAS[0]);
  const [address, setAddress] = useState(draft?.address ?? "");
  const [pos, setPos] = useState<LatLng | null>(draft?.pos ?? null);
  const [date, setDate] = useState(draft?.date ?? "");
  const [time, setTime] = useState(draft?.time ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [editAddr, setEditAddr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const attemptedResumeRef = useRef(false);

  const days = useMemo(() => nextDays(), []);
  const todaySlot = useMemo(() => slotLeftToday(), []);
  const custom = pickedId === CUSTOM;
  const service = siblings.find((s) => s.id === pickedId) ?? null;

  // Service + the rest of its category, so the "What do you need?" group can
  // offer the sibling services the way the redesign does.
  useEffect(() => {
    if (!serviceId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data: svc } = await supabase.from("services").select("*").eq("id", serviceId).single();
      const s = svc as Service | null;
      if (!s) {
        setLoading(false);
        return;
      }
      const [{ data: category }, { data: group }] = await Promise.all([
        supabase.from("service_categories").select("*").eq("id", s.category_id).maybeSingle(),
        supabase
          .from("services")
          .select("*")
          .eq("category_id", s.category_id)
          .eq("is_active", true)
          .order("base_price", { nullsFirst: false }),
      ]);
      setCat(category as ServiceCategory | null);
      const list = (group as Service[]) ?? [s];
      setSiblings(list.some((x) => x.id === s.id) ? list : [s, ...list]);
      setLoading(false);
    })();
  }, [serviceId]);

  // Prefill the address from the customer's saved default.
  useEffect(() => {
    if (draft) return;
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("customers")
        .select("default_address,lat,lng")
        .eq("profile_id", user.id)
        .maybeSingle();
      const row = data as { default_address: string | null; lat: number | null; lng: number | null } | null;
      if (!row?.default_address) return;
      const saved = splitAddress(row.default_address);
      setAddress((a) => a || saved.line);
      if (saved.area && KARACHI_AREAS.includes(saved.area)) setArea(saved.area);
      if (row.lat != null && row.lng != null) setPos((p) => p ?? { lat: row.lat!, lng: row.lng! });
    })();
  }, [draft]);

  // The draft has already been consumed into state above — clear it from
  // storage so a later visit doesn't restore stale data.
  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }, [draft]);

  // Once the service has loaded, finish the booking the user already filled
  // in before being sent to sign in.
  useEffect(() => {
    if (!draft || loading || !service || attemptedResumeRef.current) return;
    attemptedResumeRef.current = true;
    (async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (user) await createBooking(user.id);
    })();
    // createBooking is stable for this component instance; including it would
    // just re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, loading, service]);

  // What `when` resolves to on the wire.
  const schedule = useMemo(() => {
    if (when === "asap") return { date: "", time: "", label: "Now · ASAP" };
    if (when === "today" && todaySlot)
      return { date: isoDay(new Date()), time: todaySlot.value, label: `Today, ${todaySlot.label}` };
    if (when === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return { date: isoDay(d), time: SLOTS[1].value, label: `Tomorrow, ${SLOTS[1].label}` };
    }
    if (when === "pick" && date && time)
      return { date, time, label: `${fmtDay(date)}, ${SLOTS.find((s) => s.value === time)?.label}` };
    return { date: "", time: "", label: "Pick a time" };
  }, [when, date, time, todaySlot]);

  function saveDraft() {
    const d: Draft = { serviceId, pickedId, when, area, address, pos, date, time, notes };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      // sessionStorage unavailable (e.g. private mode) — Google sign-in just
      // won't be able to resume; email/password sign-in in the modal still will.
    }
  }

  async function createBooking(userId: string) {
    if (!service) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const fullAddress = joinAddress(address, area);
    const scheduledAt =
      schedule.date && schedule.time
        ? new Date(`${schedule.date}T${schedule.time}`).toISOString()
        : null;

    // Ensure a customer profile row exists (FK target for jobs).
    await supabase.from("customers").upsert(
      { profile_id: userId, default_address: fullAddress, lat: pos?.lat ?? null, lng: pos?.lng ?? null },
      { onConflict: "profile_id" }
    );

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        customer_id: userId,
        type: "fixed",
        service_id: service.id,
        title: service.name,
        description: notes || null,
        status: "created",
        address: fullAddress,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        scheduled_at: scheduledAt,
        price: service.base_price,
        commission_rate: 0.2,
      })
      .select("id")
      .single();

    if (jobErr) {
      setError(jobErr.message);
      setBusy(false);
      return;
    }
    router.push(`/bookings/view/?id=${job!.id}&new=1`);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await createClient().auth.getUser();
    if (!user) {
      setBusy(false);
      setShowAuthModal(true);
      return;
    }
    await createBooking(user.id);
  }

  if (loading) {
    return (
      <Screen>
        <TopBar title="Book" />
        <Scroll underTop pad="plain">
          <Skel h={82} />
          <Skel h={190} />
          <Skel h={90} />
        </Scroll>
      </Screen>
    );
  }

  if (!siblings.length) {
    return (
      <Screen>
        <TopBar title="Book" back="/book" />
        <Scroll underTop pad="plain">
          <EmptyK
            icon="search"
            title="Service not found"
            hint="It may have been renamed or taken offline."
          >
            <Link className="btn sm" href="/book" style={{ marginTop: 10 }}>
              Browse services
            </Link>
          </EmptyK>
        </Scroll>
      </Screen>
    );
  }

  const icon = categoryIcon(cat?.icon);
  const addressOk = address.trim().length > 2;
  const timeOk = when !== "pick" || (!!date && !!time);
  const canBook = addressOk && timeOk && !!service && !busy;

  return (
    <Screen>
      <TopBar
        title={`Book ${cat?.name ?? "a service"}`}
        back="/book"
        action={
          <Link className="ic" href="/support" aria-label="Help">
            <KIcon name="info" />
          </Link>
        }
      />

      <Scroll underTop pad="cta">
        <div className="svc-head">
          <Well icon={icon} size="lg" />
          <div>
            <b>{cat?.name ?? siblings[0].name}</b>
            <small>CNIC-verified pros · fixed Karachi rates · pay after the job</small>
          </div>
          <Pill tone="ok" icon="shield">
            Verified
          </Pill>
        </div>

        <h3 className="lbl">What do you need?</h3>
        <div className="opts" role="radiogroup" aria-label="Service">
          {siblings.map((s) => {
            const sel = s.id === pickedId;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sel}
                className={clsx("opt", sel && "sel")}
                onClick={() => setPickedId(s.id)}
              >
                <span className="rad" />
                <div>
                  <b>{s.name}</b>
                  <small>{s.description}</small>
                </div>
                <em>
                  {s.base_price === null ? (
                    "On quote"
                  ) : (
                    <>
                      {formatPKR(s.base_price)} <small>/{s.unit}</small>
                    </>
                  )}
                </em>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={pickedId === CUSTOM}
            className={clsx("opt", pickedId === CUSTOM && "sel")}
            onClick={() => setPickedId(CUSTOM)}
          >
            <span className="rad" />
            <div>
              <b>Custom job</b>
              <small>Describe it and get quotes from nearby pros</small>
            </div>
            <em>On quote</em>
          </button>
        </div>

        <h3 className="lbl">Where?</h3>
        <div className="addr card">
          <div className="mini">
            <MapArt kind="mini" />
          </div>
          <div className="txt">
            <b>{addressOk ? area : "Add your address"}</b>
            <small>
              {addressOk ? joinAddress(address, area) : "We need a street address to send a pro."}
            </small>
          </div>
          <button type="button" className="link" onClick={() => setEditAddr((v) => !v)}>
            {editAddr ? "Done" : addressOk ? "Change" : "Add"}
          </button>
        </div>

        {editAddr && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="in flat">
              <KIcon name="pin" />
              <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
                {KARACHI_AREAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <KIcon name="chev-d" xs />
            </label>
            <label className="in flat">
              <KIcon name="home" />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House / flat, street, landmark"
                autoComplete="street-address"
                aria-label="Address"
              />
            </label>
            <MapPicker
              value={pos}
              onChange={(p, addr) => {
                setPos(p);
                if (addr && !address) setAddress(addr);
              }}
            />
          </div>
        )}

        <h3 className="lbl">When?</h3>
        <div className="chips" role="radiogroup" aria-label="When">
          <button
            type="button"
            role="radio"
            aria-checked={when === "asap"}
            className={clsx("chip", when === "asap" && "sel")}
            onClick={() => setWhen("asap")}
          >
            Now · ASAP
          </button>
          {todaySlot && (
            <button
              type="button"
              role="radio"
              aria-checked={when === "today"}
              className={clsx("chip", when === "today" && "sel")}
              onClick={() => setWhen("today")}
            >
              Today, {todaySlot.label}
            </button>
          )}
          <button
            type="button"
            role="radio"
            aria-checked={when === "tomorrow"}
            className={clsx("chip", when === "tomorrow" && "sel")}
            onClick={() => setWhen("tomorrow")}
          >
            Tomorrow, {SLOTS[1].label}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={when === "pick"}
            className={clsx("chip", when === "pick" && "sel")}
            onClick={() => setWhen("pick")}
          >
            <KIcon name="clock" xs />
            Pick a time
          </button>
        </div>

        {when === "pick" && (
          <>
            <div className="chips" role="radiogroup" aria-label="Day">
              {days.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  role="radio"
                  aria-checked={date === d.iso}
                  className={clsx("chip col", date === d.iso && "sel")}
                  onClick={() => setDate(d.iso)}
                >
                  <small>{d.day}</small>
                  <b>{d.num}</b>
                </button>
              ))}
            </div>
            <div className="chips wrap" role="radiogroup" aria-label="Time">
              {SLOTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={time === s.value}
                  className={clsx("chip", time === s.value && "sel")}
                  onClick={() => setTime(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}

        <h3 className="lbl">Anything the pro should know?</h3>
        <textarea
          className="ta"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Kitchen tap leaking from the base. 2nd floor, no lift."
          aria-label="Notes for the pro"
        />

        <div className="note">
          <KIcon name="shield" />
          <p>
            <b>Pay cash when the job is done.</b> The pro confirms the final price after inspecting —
            you approve anything extra before they start.
          </p>
        </div>

        {error && (
          <div className="note bad">
            <KIcon name="alert" />
            <p>{error}</p>
          </div>
        )}
      </Scroll>

      <Cta>
        <div>
          <small>{custom ? "Quotes, not a fixed price" : `${schedule.label} · pay after the job`}</small>
          <b>
            {service === null || service.base_price === null ? (
              "On quote"
            ) : (
              <>
                {formatPKR(service.base_price)} <span>/{service.unit}</span>
              </>
            )}
          </b>
        </div>
        {custom ? (
          <Link className="btn" href="/book/custom">
            Describe the job
            <KIcon name="arrow" />
          </Link>
        ) : (
          <button type="button" className="btn" disabled={!canBook} onClick={confirm}>
            {busy ? "Booking…" : `Book ${cat?.name ?? "now"}`}
            <KIcon name="arrow" />
          </button>
        )}
      </Cta>

      {showAuthModal && (
        <AuthGateSheet
          title="Sign in to confirm your booking"
          subtitle="Your selection is saved — sign in or create an account to finish booking."
          onClose={() => setShowAuthModal(false)}
          onSuccess={async () => {
            setShowAuthModal(false);
            const {
              data: { user },
            } = await createClient().auth.getUser();
            if (user) await createBooking(user.id);
          }}
          onGoogleRedirect={() => {
            saveDraft();
            return `/book/service/?id=${serviceId}`;
          }}
        />
      )}
    </Screen>
  );
}

export default function BookServicePage() {
  return (
    <Suspense
      fallback={
        <Screen>
          <Scroll pad="plain">
            <Skel h={82} />
            <Skel h={190} />
          </Scroll>
        </Screen>
      }
    >
      <BookServiceContent />
    </Suspense>
  );
}
