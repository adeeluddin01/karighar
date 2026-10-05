"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { MapPicker } from "@/components/maps/MapPicker";
import { AuthGateModal } from "@/components/AuthGateModal";
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  KV,
  Pill,
  Progress,
  Select,
  Spinner,
  Textarea,
  formatPKR,
} from "@/components/ui";
import { KARACHI_AREAS, type Service } from "@/lib/types";
import type { LatLng } from "@/lib/maps";
import { Icon } from "@/components/Icon";

const STEPS = ["Address", "Schedule", "Confirm"] as const;

// Time slots, shown in the prototype's chip grid. `value` stays 24h so the
// existing `new Date(`${date}T${time}`)` scheduling logic is unchanged.
const SLOTS = [
  { value: "09:00", label: "9:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "19:00", label: "7:00 PM" },
];

// Persists the in-progress booking across a sign-in/sign-up detour so the
// form isn't lost — either in the inline modal or across a Google OAuth
// redirect (which necessarily leaves and returns to this page).
const DRAFT_KEY = "kg-draft-book-service";

type Draft = {
  serviceId: string;
  step: number;
  area: string;
  address: string;
  pos: LatLng | null;
  date: string;
  time: string;
  notes: string;
};

function nextDays(n = 7) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`,
      day: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" }),
      num: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    };
  });
}

function fmtDate(iso: string) {
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

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState(draft?.step ?? 1);
  const [area, setArea] = useState(draft?.area ?? KARACHI_AREAS[0]);
  const [address, setAddress] = useState(draft?.address ?? "");
  const [pos, setPos] = useState<LatLng | null>(draft?.pos ?? null);
  const [date, setDate] = useState(draft?.date ?? "");
  const [time, setTime] = useState(draft?.time ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const attemptedResumeRef = useRef(false);

  const days = nextDays();

  useEffect(() => {
    if (!serviceId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("services").select("*").eq("id", serviceId).single();
      setService(data as Service | null);
      setLoading(false);
    })();
  }, [serviceId]);

  // The draft has already been consumed into state above — clear it from
  // storage so a later visit doesn't restore stale data. Not React state, so
  // this doesn't need to go through a setState call.
  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }, [draft]);

  // Once the service has loaded, try to finish the booking the user already
  // filled in before being sent to sign in.
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

  function saveDraft() {
    const draft: Draft = { serviceId, step, area, address, pos, date, time, notes };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
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

    const fullAddress = `${address}, ${area}, Karachi`;
    const scheduledAt = date && time ? new Date(`${date}T${time}`).toISOString() : null;

    // Ensure a customer profile row exists (FK target for jobs).
    await supabase.from("customers").upsert(
      { profile_id: userId, default_address: fullAddress },
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

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
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
      <AppShell width="narrow">
        <Spinner label="Loading service…" />
      </AppShell>
    );
  }
  if (!service) {
    return (
      <AppShell width="narrow">
        <Card className="text-center">
          <p className="text-muted-foreground">Service not found.</p>
        </Card>
      </AppShell>
    );
  }

  const canContinue =
    step === 1 ? address.trim().length > 2 : step === 2 ? !!date && !!time : true;

  function back() {
    if (step > 1) setStep(step - 1);
    else router.back();
  }

  return (
    <AppShell width="narrow">
      {/* Wizard chrome */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" round onClick={back} aria-label="Back">
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">
            Step 0{step} · {STEPS[step - 1]}
          </p>
          <div className="mt-2">
            <Progress total={STEPS.length} step={step} />
          </div>
        </div>
      </div>

      {/* Service summary */}
      <Card className="mt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{service.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
          </div>
          <Pill tone={service.base_price === null ? "warn" : "info"}>
            {formatPKR(service.base_price)}
          </Pill>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          per {service.unit}
          {service.visit_fee > 0 &&
            ` · visit fee ${formatPKR(service.visit_fee)} (waived if booked)`}
        </p>
      </Card>

      <form onSubmit={confirm} className="anim mt-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-extrabold tracking-tight">Where is the job?</h2>
            <Field label="Area">
              <Select value={area} onChange={(e) => setArea(e.target.value)}>
                {KARACHI_AREAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
            </Field>
            <Field label="Address" hint="House / flat, street, landmark.">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                autoComplete="street-address"
                placeholder="e.g. House 12, Street 4, near Expo Centre"
              />
            </Field>
            <Field label="Pin your exact location">
              <MapPicker
                value={pos}
                onChange={(p, addr) => {
                  setPos(p);
                  if (addr && !address) setAddress(addr);
                }}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">When should we come?</h2>

            <p className="mt-6 mb-3 text-sm font-semibold">📅 Pick a day</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => (
                <Chip
                  key={d.iso}
                  active={date === d.iso}
                  onClick={() => setDate(d.iso)}
                  className="min-w-[4.6rem] flex-col gap-0 rounded-2xl px-4 py-2.5"
                >
                  <span className="text-xs">{d.day}</span>
                  <b>{d.num}</b>
                </Chip>
              ))}
            </div>

            <p className="mt-6 mb-3 text-sm font-semibold">⏰ Pick a time</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SLOTS.map((s) => (
                <Chip
                  key={s.value}
                  active={time === s.value}
                  onClick={() => setTime(s.value)}
                  className="justify-center"
                >
                  {s.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-extrabold tracking-tight">Almost done 🎉</h2>

            <Card>
              <KV label="Service">{service.name}</KV>
              <KV label="When">
                {date && time ? `${fmtDate(date)}, ${SLOTS.find((s) => s.value === time)?.label}` : "—"}
              </KV>
              <KV label="Where">
                {address}, {area}
              </KV>
              <div className="sep" />
              <KV label="Estimated total">{formatPKR(service.base_price)}</KV>
              <p className="mt-2 text-xs text-muted-foreground">
                Pay cash on completion. Final price is confirmed by the pro after inspection.
              </p>
            </Card>

            <Field label="Notes for the pro (optional)">
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe the problem, e.g. AC not cooling, water leaking under sink…"
              />
            </Field>

            {error && <p className="errtxt">{error}</p>}
          </div>
        )}

        {step < STEPS.length ? (
          <Button
            className="mt-6 w-full"
            disabled={!canContinue}
            onClick={() => setStep(step + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button type="submit" disabled={busy} className="mt-6 w-full">
            {busy ? "Booking…" : "Confirm booking"}
          </Button>
        )}
      </form>

      {showAuthModal && (
        <AuthGateModal
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
    </AppShell>
  );
}

export default function BookServicePage() {
  return (
    <Suspense
      fallback={
        <AppShell width="narrow">
          <Spinner label="Loading…" />
        </AppShell>
      }
    >
      <BookServiceContent />
    </Suspense>
  );
}
