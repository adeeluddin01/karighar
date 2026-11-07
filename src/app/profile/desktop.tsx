"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Icon, type IconName } from "@/components/Icon";
import { MapPicker } from "@/components/maps/MapPicker";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  Button,
  Card,
  Field,
  Input,
  KV,
  Pill,
  Rating,
  Select,
  Spinner,
} from "@/components/ui";
import { KARACHI_AREAS, type Customer, type Provider } from "@/lib/types";
import { useLanguage } from "@/lib/i18n";
import { AVATAR_ACCEPT, uploadAvatar } from "@/lib/avatar";
import { areaOf, joinAddress, splitAddress } from "@/lib/area";
import type { LatLng } from "@/lib/maps";
import { dbErrorMessage } from "@/lib/dbErrors";
import { LIMITS, firstError, normalizePkPhone, validateName, validatePhone } from "@/lib/validate";

export default function ProfilePage() {
  const { user, profile, loading } = useRequireAuth("/profile");
  const router = useRouter();
  const toast = useToast();
  const { t, tProviderStatus } = useLanguage();
  // Edits are held as `null` until the field is actually touched, and the
  // saved value shows through until then. Seeding these from an effect meant
  // any auth event — a token refresh fires one — re-ran it and wiped whatever
  // was half-typed, which read as "the form won't let me change anything".
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [phoneEdit, setPhoneEdit] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [me, setMe] = useState<Partial<Customer> | null>(null);
  // Held locally as well as on `profile`, so the new picture appears the
  // instant it uploads. useUser() reads the profile row once on mount and
  // never again, and router.refresh() is a no-op under `output: "export"`.
  const [avatarEdit, setAvatarEdit] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Address, same pattern.
  const [addrEdit, setAddrEdit] = useState<string | null>(null);
  const [areaEdit, setAreaEdit] = useState<string | null>(null);
  const [pos, setPos] = useState<LatLng | null>(null);
  const [addrBusy, setAddrBusy] = useState(false);
  // A dispatcher's own figures, mirroring the phone lane. Without this a
  // business owner on desktop gets a customer-shaped profile: a saved-address
  // card offering to send pros to them, and a "become a provider" link.
  const [biz, setBiz] = useState<{ team: number; jobs: number } | null>(null);
  // MapPicker centres on Karachi when it mounts with no pin and fires
  // onChange immediately. Left unguarded that marked the form dirty before
  // any input and let "Save address" write a placeholder pin, as well as
  // overwriting the chosen area with the geocode of the city centre.
  const autoSeed = useRef(true);

  useEffect(() => {
    if (user && profile?.role === "provider") {
      createClient()
        .from("providers")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle()
        .then(({ data }) => setProvider(data as Provider | null));
    }
    if (user && profile?.role === "business") {
      const sb = createClient();
      Promise.all([
        sb.from("business_members").select("id", { count: "exact", head: true })
          .eq("business_id", user.id).eq("status", "active"),
        sb.from("jobs").select("id", { count: "exact", head: true }).eq("business_id", user.id),
      ]).then(([t, j]) => setBiz({ team: t.count ?? 0, jobs: j.count ?? 0 }));
    }
    if (user) {
      // `*` rather than named columns so this still works if patch_v12
      // (rating_avg / jobs_rated) hasn't been applied yet.
      createClient()
        .from("customers")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle()
        .then(({ data }) => setMe(data as Partial<Customer> | null));
    }
  }, [profile, user]);

  const isBusiness = profile?.role === "business";

  // What the inputs show: the edit if there is one, otherwise what's saved.
  const fullName = nameEdit ?? profile?.full_name ?? "";
  const phone = phoneEdit ?? profile?.phone ?? "";
  // `""` after a removal, not null, so `??` doesn't fall back to the stale
  // saved value before useUser() ever re-reads the row.
  const avatarSrc = avatarEdit ?? profile?.avatar_url ?? "";
  const savedAddr = splitAddress(me?.default_address ?? null);
  const addrLine = addrEdit ?? savedAddr.line;
  const area =
    areaEdit ??
    (savedAddr.area && KARACHI_AREAS.includes(savedAddr.area) ? savedAddr.area : KARACHI_AREAS[0]);
  const addrDirty =
    addrEdit !== null || areaEdit !== null || pos !== null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    // The phone is optional here, so it is only checked when present — but
    // when it IS present it goes through the same normalizer as sign-up.
    // Before this, signup stored "+923001234567" and a later profile edit
    // stored whatever was typed, so the same person's number was in two
    // formats depending on which screen last touched it.
    const bad = firstError(
      validateName(fullName),
      phone.trim() ? validatePhone(phone) : null
    );
    if (bad) {
      toast(bad, "error");
      return;
    }
    setBusy(true);
    setSaved(false);
    // .select().single() so a write blocked by RLS comes back as an error
    // rather than a silent 0-row update. This used to ignore the result
    // entirely and report "Saved" either way.
    const { error } = await createClient()
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() ? normalizePkPhone(phone) : null,
      })
      .eq("id", user.id)
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast(t("profile.saveDetailsError") + dbErrorMessage(error), "error");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function saveAddress() {
    if (!user) return;
    setAddrBusy(true);
    const { error } = await createClient()
      .from("customers")
      .upsert(
        {
          profile_id: user.id,
          default_address: joinAddress(addrLine, area),
          lat: pos?.lat ?? me?.lat ?? null,
          lng: pos?.lng ?? me?.lng ?? null,
        },
        { onConflict: "profile_id" }
      )
      .select("profile_id")
      .single();
    setAddrBusy(false);
    if (error) {
      toast(t("profile.saveAddressError") + dbErrorMessage(error), "error");
      return;
    }
    setMe((c) => ({ ...c, default_address: joinAddress(addrLine, area) }));
    setAddrEdit(null);
    setAreaEdit(null);
    toast(t("profile.addressSaved"), "success");
  }

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
    toast(t("profile.pictureUpdated"), "success");
  }

  async function removeAvatar() {
    if (!user) return;
    setAvatarBusy(true);
    // The bucket object is left in place: it is one file per account, it will
    // be overwritten by the next upload, and clearing the column is what
    // actually takes the picture off every screen.
    const { error } = await createClient()
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id)
      .select("id")
      .single();
    setAvatarBusy(false);
    if (error) {
      toast(t("profile.removePictureError") + dbErrorMessage(error), "error");
      return;
    }
    setAvatarEdit("");
    toast(t("profile.pictureRemoved"), "success");
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading || !user) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <div className="flex items-center gap-4">
        <Avatar name={fullName || user.email} src={avatarSrc} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">
            {fullName || t("profile.title")}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {profile?.role === "customer"
              ? t("profile.roleCustomer")
              : profile?.role === "provider"
                ? t("profile.roleProvider")
                : profile?.role === "business"
                  ? t("profile.roleBusiness")
                  : profile?.role === "admin"
                    ? t("profile.roleAdmin")
                    : profile?.role}
            {provider && (
              <Pill tone={provider.status === "approved" ? "ok" : "warn"}>
                {tProviderStatus(provider.status)}
              </Pill>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void pickAvatar(e.target.files?.[0]);
                // Reset, so picking the SAME file again still fires onChange.
                e.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={avatarBusy}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="camera" size="sm" />
              {avatarBusy ? t("profile.uploading") : avatarSrc ? t("profile.changePhoto") : t("profile.addPhoto")}
            </Button>
            {avatarSrc && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                disabled={avatarBusy}
                onClick={() => void removeAvatar()}
              >
                {t("profile.remove")}
              </button>
            )}
          </div>
        </div>
      </div>

      {(me?.jobs_rated ?? 0) > 0 && (
        <Card className="mt-4">
          <KV label={t("profile.yourRatingCustomer")}>
            <Rating value={me?.rating_avg} />
          </KV>
          <KV label={t("profile.ratingsReceived")}>{me?.jobs_rated}</KV>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("profile.ratingsHint")}
          </p>
        </Card>
      )}

      {provider?.status === "approved" && (
        <Card className="mt-4">
          <KV label={t("profile.rating")}>
            <Rating value={provider.rating_avg} />
          </KV>
          <KV label={t("profile.jobsCompleted")}>{provider.jobs_completed}</KV>
        </Card>
      )}

      <form onSubmit={save} className="mt-6 space-y-4">
        <Field label={t("profile.fullName")}>
          <Input value={fullName} onChange={(e) => setNameEdit(e.target.value)} required />
        </Field>
        <Field label={t("profile.phone")}>
          <Input
            value={phone}
            onChange={(e) => setPhoneEdit(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>
        <Field label={t("profile.email")} hint={t("profile.emailHint")}>
          <Input className="opacity-60" value={user.email ?? ""} disabled />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? t("profile.saving") : t("profile.saveChanges")}
          </Button>
          {saved && (
            <Pill tone="ok" icon="check">
              {t("profile.saved")}
            </Pill>
          )}
        </div>
      </form>

      {isBusiness && (
        <Card className="mt-4">
          <KV label={t("profile.teamCount")}>{biz?.team ?? "—"}</KV>
          <KV label={t("profile.jobsDispatched")}>{biz?.jobs ?? "—"}</KV>
        </Card>
      )}

      {/* Saved address. The desktop profile had no way to edit this at all —
          the only place a location could be set was mid-booking.
          Not shown to a business: nobody is ever sent to a dispatcher. */}
      {!isBusiness && (
      <Card className="mt-8">
        <h2 className="text-base font-bold">{t("profile.savedAddress")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("profile.savedAddressHint")}
        </p>
        <div className="mt-4 space-y-4">
          <Field label={t("profile.area")}>
            <Select value={area} onChange={(e) => setAreaEdit(e.target.value)}>
              {KARACHI_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("profile.addressLine")}>
            <Input
              value={addrLine}
              onChange={(e) => setAddrEdit(e.target.value)}
              placeholder="Flat 4B, Shahbaz Lane 2"
            />
          </Field>
          <Field label={t("profile.dropPin")} hint={t("profile.dropPinHint")}>
            <MapPicker
              value={pos ?? (me?.lat != null && me?.lng != null ? { lat: me.lat, lng: me.lng } : null)}
              onChange={(next, address) => {
                if (autoSeed.current) {
                  autoSeed.current = false;   // the opening auto-centre
                  return;
                }
                setPos(next);
                // The picker reverse-geocodes; take the area from it when we
                // recognise one, so the two controls agree.
                if (address) {
                  const found = areaOf(address);
                  if (found && KARACHI_AREAS.includes(found)) setAreaEdit(found);
                }
              }}
            />
          </Field>
          <Button disabled={addrBusy || !addrDirty} onClick={saveAddress}>
            {addrBusy ? t("profile.saving") : t("profile.saveAddress")}
          </Button>
        </div>
      </Card>
      )}

      <Card padded={false} className="mt-8 overflow-hidden">
        {isBusiness ? (
          <>
            <Row href="/business/team" icon="users">
              {t("profile.yourTeam")}
            </Row>
            <Row href="/business/earnings" icon="wallet">
              {t("profile.earningsCommission")}
            </Row>
          </>
        ) : provider ? (
          provider.status === "approved" ? (
            <Row href="/pro/services" icon="wrench">
              {t("profile.manageServices")}
            </Row>
          ) : (
            <Row href="/pro/onboarding" icon="shield">
              {t("profile.viewVerification")}
            </Row>
          )
        ) : (
          <Row href="/pro" icon="briefcase">
            {t("settings.becomePro")}
          </Row>
        )}
        <Row href="/profile/ratings" icon="star">
          {profile?.role === "admin" ? t("profile.allReviews") : t("profile.myRatings")}
        </Row>
        <Row href="/settings" icon="settings">
          {t("common.settings")}
        </Row>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 p-4 text-start font-semibold text-destructive hover:bg-destructive-light"
        >
          <Icon name="logout" size="sm" /> {t("common.signOut")}
        </button>
      </Card>
    </AppShell>
  );
}

function Row({
  href,
  icon,
  children,
}: {
  href: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-border p-4 font-medium hover:bg-secondary"
    >
      <Icon name={icon} size="sm" className="text-muted-foreground" />
      <span className="flex-1">{children}</span>
      <Icon name="chevron" size="sm" className="text-muted-foreground rtl:-scale-x-100" />
    </Link>
  );
}
