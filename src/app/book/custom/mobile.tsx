"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Screen, Scroll, TopBar, Cta } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Skel, Well } from "@/components/kg/parts";
import { MapArt } from "@/components/kg/MapArt";
import { categoryIcon } from "@/components/kg/catalogIcons";
import { MapPicker } from "@/components/maps/MapPicker";
import { AuthGateSheet } from "@/components/kg/AuthGateSheet";
import { KARACHI_AREAS, type ServiceCategory } from "@/lib/types";
import { joinAddress, splitAddress } from "@/lib/area";
import type { LatLng } from "@/lib/maps";
import { clsx } from "@/lib/clsx";

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

const SLOTS = [
  { value: "09:00", label: "9:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "19:00", label: "7:00 PM" },
];

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

export default function CustomJobScreen() {
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
  const [editAddr, setEditAddr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const attemptedResumeRef = useRef(false);

  const days = useMemo(() => nextDays(), []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("service_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      const list = (data as ServiceCategory[]) ?? [];
      setCats(list);
      if (list[0]) setCategoryId((prev) => prev || list[0].id);
      setCatsLoading(false);
    })();
  }, []);

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
    const d: Draft = { categoryId, title, description, area, address, pos, date, time };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      // sessionStorage unavailable (e.g. private mode) — Google sign-in just
      // won't be able to resume; email/password sign-in in the modal still will.
    }
  }

  async function postJob(userId: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const fullAddress = joinAddress(address, area);
    const scheduledAt = date && time ? new Date(`${date}T${time}`).toISOString() : null;
    const catName = cats.find((c) => c.id === categoryId)?.name ?? "Custom job";

    await supabase.from("customers").upsert(
      { profile_id: userId, default_address: fullAddress, lat: pos?.lat ?? null, lng: pos?.lng ?? null },
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

  async function submit() {
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

  const addressOk = address.trim().length > 2;
  const canPost = !!title.trim() && description.trim().length > 5 && addressOk && !busy;

  return (
    <Screen>
      <TopBar title="Describe the job" back="/book" />
      <Scroll underTop pad="cta">
        <div className="svc-head">
          <Well icon="edit" size="lg" />
          <div>
            <b>Get quotes</b>
            <small>
              Verified pros review your job and send a price. You compare and accept the one you
              want — nothing to pay until the work is done.
            </small>
          </div>
        </div>

        <h3 className="lbl">What kind of work is it?</h3>
        {catsLoading ? (
          <Skel h={38} />
        ) : (
          <div className="chips" role="radiogroup" aria-label="Category">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={categoryId === c.id}
                className={clsx("chip", categoryId === c.id && "sel")}
                onClick={() => setCategoryId(c.id)}
              >
                <KIcon name={categoryIcon(c.icon)} xs />
                {c.name}
              </button>
            ))}
          </div>
        )}

        <h3 className="lbl">Give it a title</h3>
        <label className="in flat">
          <KIcon name="wrench" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Install 2 ceiling fans and fix wiring"
            aria-label="Job title"
          />
        </label>

        <h3 className="lbl">Describe it</h3>
        <textarea
          className="ta"
          style={{ minHeight: 120 }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="The more detail you give, the more accurate the quotes. Mention what's broken, how many items, which floor, and anything the pro should bring."
          aria-label="Describe the job"
        />

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

        <h3 className="lbl">Preferred time (optional)</h3>
        <div className="chips" role="radiogroup" aria-label="Day">
          <button
            type="button"
            role="radio"
            aria-checked={!date}
            className={clsx("chip", !date && "sel")}
            onClick={() => {
              setDate("");
              setTime("");
            }}
          >
            Flexible
          </button>
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
        {date && (
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
        )}

        <div className="note">
          <KIcon name="shield" />
          <p>
            <b>Quotes are free.</b> Karighar takes its cut from the pro, never from you, and you only
            pay once the work is done.
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
          <small>Quotes from nearby pros</small>
          <b>
            On quote <span>free to post</span>
          </b>
        </div>
        <button type="button" className="btn" disabled={!canPost} onClick={submit}>
          {busy ? "Posting…" : "Get quotes"}
          <KIcon name="arrow" />
        </button>
      </Cta>

      {showAuthModal && (
        <AuthGateSheet
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
    </Screen>
  );
}
