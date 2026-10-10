"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { useToast } from "@/components/Toast";
import { Screen, Scroll, Tabs } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Ava, Pill, Skel, Well } from "@/components/kg/parts";
import { useDarkMode } from "@/lib/theme";
import { areaOf, joinAddress, splitAddress } from "@/lib/area";
import { KARACHI_AREAS, type Provider } from "@/lib/types";
import { BRAND } from "@/lib/config";

export default function ProfileScreen() {
  const { user, profile, loading } = useRequireAuth("/profile");
  const router = useRouter();
  const toast = useToast();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ jobs: number; done: number; reviews: number } | null>(null);
  const [dark, setDark] = useDarkMode();

  const [editMe, setEditMe] = useState(false);
  const [editAddr, setEditAddr] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const [{ data: customer }, { count: jobs }, { count: done }, { count: reviews }] =
        await Promise.all([
          supabase.from("customers").select("default_address").eq("profile_id", user.id).maybeSingle(),
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", user.id),
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", user.id)
            .in("status", ["paid", "rated"]),
          supabase
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", user.id),
        ]);
      setAddress((customer as { default_address: string | null } | null)?.default_address ?? null);
      setCounts({ jobs: jobs ?? 0, done: done ?? 0, reviews: reviews ?? 0 });
    })();
  }, [user]);

  useEffect(() => {
    if (!user || profile?.role !== "provider") return;
    createClient()
      .from("providers")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle()
      .then(({ data }) => setProvider(data as Provider | null));
  }, [user, profile?.role]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading || !user) {
    return (
      <Screen>
        <Scroll>
          <Skel h={34} />
          <Skel h={104} />
          <Skel h={72} />
          <Skel h={180} />
        </Scroll>
        <Tabs />
      </Screen>
    );
  }

  const name = profile?.full_name ?? null;
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : null;
  const area = areaOf(address);

  // Where the "for technicians" card sends you depends on how far along the
  // application is.
  const proLink =
    provider?.status === "approved"
      ? "/pro/dashboard"
      : provider
        ? "/pro/onboarding"
        : "/pro";

  return (
    <Screen>
      <Scroll>
        <header className="hh">
          <h1>Profile</h1>
          <Link className="ic" href="/settings" aria-label="Settings">
            <KIcon name="sliders" />
          </Link>
        </header>

        <div className="me card">
          <Ava name={name ?? user.email} size="xl" />
          <div>
            <b>{name ?? "Your profile"}</b>
            <small>{profile?.phone ?? user.email}</small>
            <small>
              {area ? `${area}, ${BRAND.city}` : BRAND.city}
              {memberSince ? ` · member since ${memberSince}` : ""}
            </small>
            {provider && (
              <Pill
                tone={provider.status === "approved" ? "ok" : provider.status === "pending" ? "warn" : "bad"}
                icon={provider.status === "approved" ? "shield" : undefined}
                className="kg-mt-6"
              >
                Pro · {provider.status}
              </Pill>
            )}
          </div>
          <button
            type="button"
            className="ic sm"
            onClick={() => setEditMe(true)}
            aria-label="Edit profile"
          >
            <KIcon name="edit" />
          </button>
        </div>

        <div className="stats3 cardless">
          <div>
            <b>{counts?.jobs ?? "—"}</b>
            <small>Bookings</small>
          </div>
          <div>
            <b>{counts?.done ?? "—"}</b>
            <small>Completed</small>
          </div>
          <div>
            <b>{counts?.reviews ?? "—"}</b>
            <small>Reviews</small>
          </div>
        </div>

        <Link className="promo" href={proLink}>
          <div>
            <span className="eyebrow">For technicians</span>
            <b>{provider?.status === "approved" ? "Open your pro dashboard" : `Earn with ${BRAND.name}`}</b>
            <p>
              {provider?.status === "approved"
                ? "Jobs near you, your earnings and what you owe in commission."
                : "Get matched to jobs near you and keep 80–85% of every job. CNIC and a selfie to verify, approval in 1–2 days."}
            </p>
          </div>
          <span className="ic">
            <KIcon name="arrow" />
          </span>
        </Link>

        <h3 className="lbl">Account</h3>
        <div className="menu card">
          <button type="button" onClick={() => setEditAddr(true)}>
            <Well icon="pin" size="sm" />
            <div>
              <b>Saved address</b>
              <small>{address ?? "Add the address we should send pros to"}</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </button>
          <Link href="/bookings">
            <Well icon="receipt" size="sm" />
            <div>
              <b>Bookings &amp; receipts</b>
              <small>
                {counts ? `${counts.jobs} booking${counts.jobs === 1 ? "" : "s"}` : "Your history"}
              </small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/settings">
            <Well icon="wallet" size="sm" />
            <div>
              <b>Payment methods</b>
              <small>Cash on completion · wallets coming soon</small>
            </div>
            <Pill tone="soon">Cash</Pill>
          </Link>
          <Link href="/settings">
            <Well icon="globe" size="sm" />
            <div>
              <b>Language</b>
              <small>English · اردو coming soon</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <label htmlFor="kg-theme-sw">
            <Well icon="moon" size="sm" />
            <div>
              <b>Dark theme</b>
              <small>Follows your device unless you choose here</small>
            </div>
            <input
              className="sw-in"
              type="checkbox"
              id="kg-theme-sw"
              checked={dark}
              onChange={(e) => setDark(e.target.checked)}
            />
          </label>
        </div>

        <h3 className="lbl">Support</h3>
        <div className="menu card">
          <Link href="/support">
            <Well icon="headset" size="sm" />
            <div>
              <b>Help &amp; support</b>
              <small>9 am – 9 pm, every day · WhatsApp or call</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/notifications">
            <Well icon="bell" size="sm" />
            <div>
              <b>Notifications</b>
              <small>Job updates and messages</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/terms">
            <Well icon="doc" size="sm" />
            <div>
              <b>Terms &amp; privacy</b>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <button type="button" className="bad" onClick={signOut}>
            <Well icon="logout" size="sm" />
            <div>
              <b>Log out</b>
            </div>
          </button>
        </div>

        <small style={{ textAlign: "center" }}>
          {BRAND.name} · {BRAND.city}, Pakistan
        </small>
      </Scroll>
      <Tabs />

      {editMe && (
        <EditProfileSheet
          userId={user.id}
          name={name ?? ""}
          phone={profile?.phone ?? ""}
          onClose={() => setEditMe(false)}
          onSaved={() => {
            setEditMe(false);
            toast("Profile updated", "success");
            router.refresh();
          }}
        />
      )}

      {editAddr && (
        <EditAddressSheet
          userId={user.id}
          current={address}
          onClose={() => setEditAddr(false)}
          onSaved={(next) => {
            setAddress(next);
            setEditAddr(false);
            toast("Address saved", "success");
          }}
        />
      )}
    </Screen>
  );
}

/* ---------------- sheets ---------------- */

function EditProfileSheet({
  userId,
  name,
  phone,
  onClose,
  onSaved,
}: {
  userId: string;
  name: string;
  phone: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState(name);
  const [tel, setTel] = useState(phone);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await createClient()
      .from("profiles")
      .update({ full_name: fullName.trim() || null, phone: tel.trim() || null })
      .eq("id", userId)
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast("Couldn't save — " + error.message, "error");
      return;
    }
    onSaved();
  }

  return (
    <Sheet title="Your details" hint="This is what your pro sees when a job is assigned." onClose={onClose}>
      <label className="in flat">
        <KIcon name="user" />
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          autoComplete="name"
          aria-label="Full name"
        />
      </label>
      <label className="in flat">
        <KIcon name="phone" />
        <input
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          placeholder="+92 300 1234567"
          inputMode="tel"
          autoComplete="tel"
          aria-label="Phone"
        />
      </label>
      <button type="button" className="btn wide" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </Sheet>
  );
}

function EditAddressSheet({
  userId,
  current,
  onClose,
  onSaved,
}: {
  userId: string;
  current: string | null;
  onClose: () => void;
  onSaved: (next: string) => void;
}) {
  const toast = useToast();
  const saved = splitAddress(current);
  const [area, setArea] = useState(
    saved.area && KARACHI_AREAS.includes(saved.area) ? saved.area : KARACHI_AREAS[0]
  );
  const [line, setLine] = useState(saved.line);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = joinAddress(line, area);
    setBusy(true);
    const { error } = await createClient()
      .from("customers")
      .upsert({ profile_id: userId, default_address: next }, { onConflict: "profile_id" })
      .select("profile_id")
      .single();
    setBusy(false);
    if (error) {
      toast("Couldn't save — " + error.message, "error");
      return;
    }
    onSaved(next);
  }

  return (
    <Sheet
      title="Saved address"
      hint="Where we send pros by default. You can still change it per booking."
      onClose={onClose}
    >
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
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder="House / flat, street, landmark"
          autoComplete="street-address"
          aria-label="Address"
        />
      </label>
      <button
        type="button"
        className="btn wide"
        disabled={busy || line.trim().length < 3}
        onClick={save}
      >
        {busy ? "Saving…" : "Save address"}
      </button>
    </Sheet>
  );
}

function Sheet({
  title,
  hint,
  onClose,
  children,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="over"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="over-card" role="dialog" aria-modal="true" aria-label={title}>
        <span className="grab" />
        <div className="sh-head">
          <div>
            <h2 style={{ fontSize: 19 }}>{title}</h2>
            {hint && <small>{hint}</small>}
          </div>
          <button type="button" className="ic sm" onClick={onClose} aria-label="Close">
            <KIcon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
