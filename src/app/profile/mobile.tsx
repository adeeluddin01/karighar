"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { useUnreadCount } from "@/lib/useNotifications";
import { useToast } from "@/components/Toast";
import { Screen, Scroll, Tabs } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Ava, Pill, Skel, Well } from "@/components/kg/parts";
import { proEntry } from "@/components/nav";
import { useDarkMode } from "@/lib/theme";
import { areaOf, joinAddress, splitAddress } from "@/lib/area";
import { MapPicker } from "@/components/maps/MapPicker";
import type { LatLng } from "@/lib/maps";
import { KARACHI_AREAS, type Customer, type Provider } from "@/lib/types";
import { AVATAR_ACCEPT, uploadAvatar } from "@/lib/avatar";
import { BRAND } from "@/lib/config";
import { useLanguage } from "@/lib/i18n";
import { dbErrorMessage } from "@/lib/dbErrors";
import { LIMITS, firstError, normalizePkPhone, validateName, validatePhone } from "@/lib/validate";

export default function ProfileScreen() {
  const { user, profile, providerStatus, loading } = useRequireAuth("/profile");
  const unreadAlerts = useUnreadCount(user?.id);
  const router = useRouter();
  const toast = useToast();
  const { t, tProviderStatus, lang } = useLanguage();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [counts, setCounts] = useState<{
    jobs: number;
    done: number;
    ratingAvg: number;
    jobsRated: number;
  } | null>(null);
  const [dark, setDark] = useDarkMode();
  // A dispatcher's own figures. Profile is one of their four phone tabs, so
  // without this they land on a customer's profile: "0 Bookings, 0
  // Completed" and an address prompt offering to send pros to them.
  const [biz, setBiz] = useState<{ team: number; jobs: number } | null>(null);

  // Held locally too, so the new picture appears the instant it uploads —
  // useUser() reads the profile row once on mount and never again.
  const [avatarEdit, setAvatarEdit] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editMe, setEditMe] = useState(false);
  const [editAddr, setEditAddr] = useState(false);

  const isBusiness = profile?.role === "business";
  const isProvider = profile?.role === "provider";

  // Providers skip the customer counts below: their "Bookings" figure
  // counted jobs where they were the CUSTOMER (usually zero), which is
  // how a pro landed on a profile showing "0 Bookings, 0 Completed"
  // while holding real work. Their figures come from the providers row.
  useEffect(() => {
    if (!user || isBusiness || isProvider) return;
    const supabase = createClient();
    (async () => {
      const [{ data: customer }, { count: jobs }, { count: done }] =
        await Promise.all([
          // `*` rather than named columns so the page still renders if
          // patch_v12 (rating_avg / jobs_rated) hasn't been applied yet.
          supabase.from("customers").select("*").eq("profile_id", user.id).maybeSingle(),
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", user.id),
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", user.id)
            .in("status", ["paid", "rated"]),
        ]);
      const row = customer as Partial<Customer> | null;
      setAddress(row?.default_address ?? null);
      setPin(row?.lat != null && row?.lng != null ? { lat: row.lat, lng: row.lng } : null);
      setCounts({
        jobs: jobs ?? 0,
        done: done ?? 0,
        ratingAvg: row?.rating_avg ?? 0,
        jobsRated: row?.jobs_rated ?? 0,
      });
    })();
  }, [user, isBusiness, isProvider]);

  useEffect(() => {
    if (!user || !isBusiness) return;
    const supabase = createClient();
    (async () => {
      const [{ count: team }, { count: jobs }] = await Promise.all([
        supabase
          .from("business_members")
          .select("id", { count: "exact", head: true })
          .eq("business_id", user.id)
          .eq("status", "active"),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("business_id", user.id),
      ]);
      setBiz({ team: team ?? 0, jobs: jobs ?? 0 });
    })();
  }, [user, isBusiness]);

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
  // `""` after a removal, not null, so `??` doesn't fall back to the stale
  // saved value before useUser() ever re-reads the row.
  const avatarSrc = avatarEdit ?? profile?.avatar_url ?? "";

  async function pickAvatar(file: File | undefined) {
    if (!file || !user) return;
    setAvatarBusy(true);
    const supabase = createClient();
    const up = await uploadAvatar(supabase, user.id, file);
    if (up.error) {
      setAvatarBusy(false);
      toast(up.error, "error");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: up.url })
      .eq("id", user.id)
      .select("id")
      .single();
    setAvatarBusy(false);
    if (error) {
      toast(t("profile.savePictureError") + dbErrorMessage(error), "error");
      return;
    }
    setAvatarEdit(up.url);
    toast("Profile picture updated.", "success");
  }
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : null;
  const area = areaOf(address);

  // Where the "for technicians" card sends you depends on how far along the
  // application is. Shared with Settings so the two can't drift; the card
  // keeps its own, more inviting copy. Null for an admin, who gets no card.
  const pro = proEntry(profile?.role, providerStatus);

  return (
    <Screen>
      <Scroll>
        <header className="hh">
          <h1>{t("common.profile")}</h1>
          <Link className="ic" href="/settings" aria-label={t("common.settings")}>
            <KIcon name="sliders" />
          </Link>
        </header>

        <div className="me card">
          {/* The whole well is the control — a 76px tap target beats a
              separate link, and there is no room for one in this row. */}
          <button
            type="button"
            className="ava-pick"
            disabled={avatarBusy}
            onClick={() => fileRef.current?.click()}
            aria-label={avatarSrc ? t("profile.changePicture") : t("profile.addPicture")}
          >
            <Ava name={name ?? user.email} src={avatarSrc} size="xl" />
            <i className="ava-cam" aria-hidden="true">
              <KIcon name={avatarBusy ? "refresh" : "camera"} />
            </i>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="kg-hidden"
            onChange={(e) => {
              void pickAvatar(e.target.files?.[0]);
              // Reset, so picking the SAME file again still fires onChange.
              e.target.value = "";
            }}
          />
          <div>
            <b>{name ?? t("profile.title")}</b>
            <small>{profile?.phone ?? user.email}</small>
            <small>
              {area ? `${area}, ${BRAND.city}` : BRAND.city}
              {memberSince ? (lang === "ur" ? ` · ${memberSince} ${t("profile.memberSince")}` : ` · ${t("profile.memberSince")} ${memberSince}`) : ""}
            </small>
            {provider && (
              <Pill
                tone={provider.status === "approved" ? "ok" : provider.status === "pending" ? "warn" : "bad"}
                icon={provider.status === "approved" ? "shield" : undefined}
                className="kg-mt-6"
              >
                {t("profile.roleProvider")} · {tProviderStatus(provider.status)}
              </Pill>
            )}
          </div>
          <button
            type="button"
            className="ic sm"
            onClick={() => setEditMe(true)}
            aria-label={t("profile.editProfile")}
          >
            <KIcon name="edit" />
          </button>
        </div>

        {isBusiness ? (
          <div className="stats3 cardless">
            <div>
              <b>{biz?.team ?? "—"}</b>
              <small>{t("profile.onTheTeam")}</small>
            </div>
            <div>
              <b>{biz?.jobs ?? "—"}</b>
              <small>{t("profile.dispatched")}</small>
            </div>
            <div>
              <b>—</b>
              <small>{t("profile.dispatcher")}</small>
            </div>
          </div>
        ) : isProvider ? (
          <div className="stats3 cardless">
            <div>
              <b>{provider?.jobs_completed ?? "—"}</b>
              <small>{t("profile.jobsDone")}</small>
            </div>
            <div>
              <b>{provider?.rating_avg ? provider.rating_avg.toFixed(1) : t("profile.new")}</b>
              <small>{t("profile.proRating")}</small>
            </div>
            <div>
              <b>{t("profile.roleProvider")}</b>
              <small>{t("profile.asTechnician")}</small>
            </div>
          </div>
        ) : (
          <div className="stats3 cardless">
            <div>
              <b>{counts?.jobs ?? "—"}</b>
              <small>{t("profile.bookings")}</small>
            </div>
            <div>
              <b>{counts?.done ?? "—"}</b>
              <small>{t("profile.completed")}</small>
            </div>
            <div>
              <b>{counts && counts.jobsRated > 0 ? counts.ratingAvg.toFixed(1) : "—"}</b>
              <small>{counts && counts.jobsRated > 0 ? t("profile.yourRating") : t("profile.notRatedYet")}</small>
            </div>
          </div>
        )}

        {pro && (
          <Link className="promo" href={pro.href}>
            <div>
              <span className="eyebrow">{t("profile.forTechnicians")}</span>
              <b>
                {provider?.status === "approved"
                  ? t("profile.openProDashboard")
                  : t("profile.earnWith")}
              </b>
              <p>
                {provider?.status === "approved"
                  ? t("profile.proDashboardHint")
                  : t("profile.earnHint")}
              </p>
            </div>
            <span className="ic">
              <KIcon name="arrow" />
            </span>
          </Link>
        )}

        <h3 className="lbl">{t("profile.account")}</h3>
        <div className="menu card">
          {/* A dispatcher has no saved address (nobody is sent to them) and
              no bookings of their own — the equivalents are their team and
              the money their technicians are holding. */}
          {isBusiness ? (
            <>
              <Link href="/business/team">
                <Well icon="users" size="sm" />
                <div>
                  <b>{t("profile.yourTeam")}</b>
                  <small>
                    {biz
                      ? lang === "ur"
                        ? `${biz.team} ٹیکنیشن`
                        : `${biz.team} technician${biz.team === 1 ? "" : "s"}`
                      : t("profile.teamHint")}
                  </small>
                </div>
                <KIcon name="chev-r" className="chev" />
              </Link>
              <Link href="/business/services">
                <Well icon="wrench" size="sm" />
                <div>
                  <b>{t("profile.services")}</b>
                  <small>{t("profile.servicesHint")}</small>
                </div>
                <KIcon name="chev-r" className="chev" />
              </Link>
              <Link href="/business/earnings">
                <Well icon="receipt" size="sm" />
                <div>
                  <b>{t("profile.earningsCommission")}</b>
                  <small>
                    {biz
                      ? lang === "ur"
                        ? `${biz.jobs} کام بھیجے گئے`
                        : `${biz.jobs} job${biz.jobs === 1 ? "" : "s"} dispatched`
                      : t("profile.earningsHint")}
                  </small>
                </div>
                <KIcon name="chev-r" className="chev" />
              </Link>
            </>
          ) : isProvider ? (
            <>
              {/* Bookings &amp; receipts is a customer surface — a provider
                  has no bookings of their own, and this link sent them to
                  an empty customer list while their real past jobs hid
                  behind the dashboard's "Earnings" button. Past jobs live
                  here now, labelled as what they are. */}
              <Link href="/pro/history">
                <Well icon="history" size="sm" />
                <div>
                  <b>{t("profile.pastJobsEarnings")}</b>
                  <small>{t("profile.pastJobsHint")}</small>
                </div>
                <KIcon name="chev-r" className="chev" />
              </Link>
              {provider?.status === "approved" ? (
                <Link href="/pro/services">
                  <Well icon="wrench" size="sm" />
                  <div>
                    <b>{t("profile.manageServices")}</b>
                    <small>{t("profile.servicesCoverHint")}</small>
                  </div>
                  <KIcon name="chev-r" className="chev" />
                </Link>
              ) : (
                <Link href="/pro/onboarding">
                  <Well icon="shield" size="sm" />
                  <div>
                    <b>{t("profile.viewVerification")}</b>
                    <small>{t("profile.verificationHint")}</small>
                  </div>
                  <KIcon name="chev-r" className="chev" />
                </Link>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditAddr(true)}>
                <Well icon="pin" size="sm" />
                <div>
                  <b>{t("profile.savedAddress")}</b>
                  <small>{address ?? t("profile.addAddressHint")}</small>
                </div>
                <KIcon name="chev-r" className="chev" />
              </button>
              <Link href="/bookings">
                <Well icon="receipt" size="sm" />
                <div>
                  <b>{t("profile.bookingsReceipts")}</b>
                  <small>
                    {counts
                      ? lang === "ur"
                        ? `${counts.jobs} بکنگ`
                        : `${counts.jobs} booking${counts.jobs === 1 ? "" : "s"}`
                      : t("profile.yourHistory")}
                  </small>
                </div>
                <KIcon name="chev-r" className="chev" />
              </Link>
            </>
          )}
          <Link href="/profile/ratings">
            <Well icon="star" size="sm" />
            <div>
              <b>{profile?.role === "admin" ? t("profile.allReviews") : t("profile.myRatings")}</b>
              <small>
                {profile?.role === "admin"
                  ? t("profile.allReviewsHint")
                  : t("profile.myRatingsHint")}
              </small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/settings">
            <Well icon="wallet" size="sm" />
            <div>
              <b>{t("profile.paymentMethods")}</b>
              <small>{t("profile.paymentHint")}</small>
            </div>
            <Pill tone="soon">{t("profile.cash")}</Pill>
          </Link>
          <Link href="/settings">
            <Well icon="globe" size="sm" />
            <div>
              <b>{t("profile.language")}</b>
              <small>{lang === "ur" ? "اردو · English" : "English · اردو"}</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <label htmlFor="kg-theme-sw">
            <Well icon="moon" size="sm" />
            <div>
              <b>{t("profile.darkTheme")}</b>
              <small>{t("profile.darkThemeHint")}</small>
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

        <h3 className="lbl">{t("profile.support")}</h3>
        <div className="menu card">
          <Link href="/support">
            <Well icon="headset" size="sm" />
            <div>
              <b>{t("profile.helpSupport")}</b>
              <small>{t("profile.helpHint")}</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/notifications/">
            <Well icon="bell" size="sm" />
            <div>
              <b>{t("profile.notifications")}</b>
              <small>
                {unreadAlerts > 0
                  ? lang === "ur"
                    ? `${unreadAlerts} ناپڑھی`
                    : `${unreadAlerts} unread`
                  : t("profile.notificationsHint")}
              </small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/terms">
            <Well icon="doc" size="sm" />
            <div>
              <b>{t("profile.termsPrivacy")}</b>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <button type="button" className="bad" onClick={signOut}>
            <Well icon="logout" size="sm" />
            <div>
              <b>{t("settings.logOut")}</b>
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
            toast(t("profile.profileUpdated"), "success");
            router.refresh();
          }}
        />
      )}

      {editAddr && (
        <EditAddressSheet
          userId={user.id}
          current={address}
          currentPin={pin}
          onClose={() => setEditAddr(false)}
          onSaved={(next, nextPin) => {
            setAddress(next);
            setPin(nextPin);
            setEditAddr(false);
            toast(t("profile.addressSaved"), "success");
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
  const { t } = useLanguage();
  const [fullName, setFullName] = useState(name);
  const [tel, setTel] = useState(phone);
  const [busy, setBusy] = useState(false);

  async function save() {
    // Same optional-but-normalized rule as the desktop lane; see the comment
    // there. Both lanes have to agree or the stored format depends on the
    // width of the window the edit happened in.
    const bad = firstError(
      validateName(fullName),
      tel.trim() ? validatePhone(tel) : null
    );
    if (bad) {
      toast(bad, "error");
      return;
    }
    setBusy(true);
    const { error } = await createClient()
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        phone: tel.trim() ? normalizePkPhone(tel) : null,
      })
      .eq("id", userId)
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast(t("profile.saveError") + dbErrorMessage(error), "error");
      return;
    }
    onSaved();
  }

  return (
    <Sheet title={t("profile.yourDetails")} hint={t("profile.detailsHint")} onClose={onClose}>
      <label className="in flat">
        <KIcon name="user" />
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("profile.fullName")}
          autoComplete="name"
          maxLength={LIMITS.fullName}
          aria-label={t("profile.fullName")}
        />
      </label>
      <label className="in flat">
        <KIcon name="phone" />
        <input
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          placeholder="+92 300 1234567"
          inputMode="tel"
          maxLength={18}
          autoComplete="tel"
          aria-label={t("profile.phone")}
        />
      </label>
      <button type="button" className="btn wide" disabled={busy} onClick={save}>
        {busy ? t("profile.saving") : t("profile.saveChanges")}
      </button>
    </Sheet>
  );
}

function EditAddressSheet({
  userId,
  current,
  currentPin,
  onClose,
  onSaved,
}: {
  userId: string;
  current: string | null;
  currentPin: LatLng | null;
  onClose: () => void;
  onSaved: (next: string, pin: LatLng | null) => void;
}) {
  const toast = useToast();
  const { t } = useLanguage();
  const [pin, setPin] = useState<LatLng | null>(currentPin);
  // MapPicker centres itself on Karachi when it opens with no pin, and that
  // fires onChange straight away. Without this the map would silently
  // overwrite the area you picked from the dropdown before you touched
  // anything. The first callback is only adopted when there WAS a pin to
  // move, i.e. when it can only have come from the user.
  const autoSeed = useRef(currentPin === null);
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
      .upsert(
        {
          profile_id: userId,
          default_address: next,
          lat: pin?.lat ?? null,
          lng: pin?.lng ?? null,
        },
        { onConflict: "profile_id" }
      )
      .select("profile_id")
      .single();
    setBusy(false);
    if (error) {
      toast(t("profile.saveError") + dbErrorMessage(error), "error");
      return;
    }
    onSaved(next, pin);
  }

  return (
    <Sheet
      title={t("profile.savedAddress")}
      hint={t("profile.savedAddressHint")}
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
          placeholder={t("profile.addressLine")}
          autoComplete="street-address"
          aria-label="Address"
        />
      </label>
      {/* The pin, not just the text. Without it we only ever had a street
          name to send a pro to. */}
      <div style={{ marginTop: 10 }}>
        <MapPicker
          value={pin}
          onChange={(next, addr) => {
            setPin(next);
            if (autoSeed.current) {
              autoSeed.current = false;   // that was the opening auto-centre
              return;
            }
            if (addr) {
              const found = areaOf(addr);
              if (found && KARACHI_AREAS.includes(found)) setArea(found);
            }
          }}
        />
      </div>
      <button
        type="button"
        className="btn wide"
        disabled={busy || line.trim().length < 3}
        onClick={save}
      >
        {busy ? t("profile.saving") : t("profile.saveAddress")}
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
  const { t } = useLanguage();
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
          <button type="button" className="ic sm" onClick={onClose} aria-label={t("common.close")}>
            <KIcon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
