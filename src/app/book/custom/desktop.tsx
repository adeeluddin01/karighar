"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { MapPicker } from "@/components/maps/MapPicker";
import { AuthGateModal } from "@/components/AuthGateModal";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { KARACHI_AREAS, type ServiceCategory } from "@/lib/types";
import type { LatLng } from "@/lib/maps";

// Persists the in-progress job post across a sign-in/sign-up detour — either
// the inline modal (same tab, no reload) or a Google OAuth redirect (which
// necessarily leaves and returns to this page).
const DRAFT_KEY = "kg-draft-book-custom";

type Draft = {
  categoryId: string;
  title: string;
  description: string;
  area: string;
  address: string;
  pos: LatLng | null;
  date: string;
  time: string;
};

// Read-only: does not clear the draft, so it stays safe to call twice (React
// Strict Mode double-invokes lazy initializers).
function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export default function CustomJobPage() {
  const router = useRouter();

  // A draft left behind by a Google OAuth round-trip (same-tab sign-in never
  // needs this — the form is already sitting in React state).
  const [draft] = useState<Draft | null>(() => readDraft());

  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [categoryId, setCategoryId] = useState(draft?.categoryId ?? "");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [area, setArea] = useState(draft?.area ?? KARACHI_AREAS[0]);
  const [address, setAddress] = useState(draft?.address ?? "");
  const [pos, setPos] = useState<LatLng | null>(draft?.pos ?? null);
  const [date, setDate] = useState(draft?.date ?? "");
  const [time, setTime] = useState(draft?.time ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const attemptedResumeRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("service_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      const list = (data as ServiceCategory[]) || [];
      setCats(list);
      if (list[0]) setCategoryId((prev) => prev || list[0].id);
      setCatsLoading(false);
    })();
  }, []);

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

  // Once categories have loaded, try to finish posting the job the user
  // already filled in before being sent to sign in.
  useEffect(() => {
    if (!draft || catsLoading || attemptedResumeRef.current) return;
    attemptedResumeRef.current = true;
    (async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (user) await postJob(user.id);
    })();
    // postJob is stable for this component instance; including it would just
    // re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, catsLoading]);

  function saveDraft() {
    const draft: Draft = { categoryId, title, description, area, address, pos, date, time };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // sessionStorage unavailable (e.g. private mode) — Google sign-in just
      // won't be able to resume; email/password sign-in in the modal still will.
    }
  }

  async function postJob(userId: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const fullAddress = `${address}, ${area}, Karachi`;
    const scheduledAt = date && time ? new Date(`${date}T${time}`).toISOString() : null;
    const catName = cats.find((c) => c.id === categoryId)?.name ?? "Custom job";

    await supabase.from("customers").upsert(
      { profile_id: userId, default_address: fullAddress },
      { onConflict: "profile_id" }
    );

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        customer_id: userId,
        type: "custom",
        service_id: null,
        title: title || catName,
        description,
        status: "bidding",
        address: fullAddress,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        scheduled_at: scheduledAt,
        price: null,
        commission_rate: 0.15,
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

  async function submit(e: React.FormEvent) {
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
    await postJob(user.id);
  }

  return (
    <AppShell width="narrow">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" round onClick={() => router.back()} aria-label="Back">
          <Icon name="back" />
        </Button>
        <PageHeader
          className="mb-0 flex-1"
          title="Post a custom job"
          subtitle="Describe your job and verified pros will send you quotes. You pick the one you like."
        />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Job title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Install 2 ceiling fans and fix wiring"
          />
        </Field>
        <Field label="Describe the job" hint="The more detail you give, the more accurate the quotes.">
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Give as much detail as you can so pros can quote accurately."
          />
        </Field>
        <Field label="Area">
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            {KARACHI_AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </Field>
        <Field label="Address">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            autoComplete="street-address"
            placeholder="House / flat, street, landmark"
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preferred date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Preferred time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        <Card className="bg-primary-light" padded>
          <p className="text-sm font-semibold text-accent-foreground">How quoting works</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Verified pros review your job and send a price. You compare and accept the one you
            want — no payment until the work is done.
          </p>
        </Card>

        {error && <p className="errtxt">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Posting…" : "Post job & get quotes"}
        </Button>
      </form>

      {showAuthModal && (
        <AuthGateModal
          title="Sign in to post your job"
          subtitle="Your details are saved — sign in or create an account to get quotes."
          onClose={() => setShowAuthModal(false)}
          onSuccess={async () => {
            setShowAuthModal(false);
            const {
              data: { user },
            } = await createClient().auth.getUser();
            if (user) await postJob(user.id);
          }}
          onGoogleRedirect={() => {
            saveDraft();
            return "/book/custom";
          }}
        />
      )}
    </AppShell>
  );
}
