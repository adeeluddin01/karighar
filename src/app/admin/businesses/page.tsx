"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { useToast } from "@/components/Toast";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Pill,
  Rating,
  Spinner,
} from "@/components/ui";
import type { Business, BusinessMember, BusinessStatus, Profile } from "@/lib/types";
import { fetchEmails, matchesQuery } from "@/lib/adminSearch";
import { Icon } from "@/components/Icon";
import { MapPicker } from "@/components/maps/MapPicker";
import { isValidCnic } from "@/lib/validate";
import { CommissionField } from "@/components/admin/CommissionField";
import { DefaultCommissionCard } from "@/components/admin/DefaultCommissionCard";
import {
  DEFAULT_COMMISSION,
  PLATFORM_RATE_COLUMNS,
  fromPercent,
  ratePairOf,
  toPercent,
  validatePercent,
  type PlatformSettings,
  type RatePair,
} from "@/lib/commission";
import type { LatLng } from "@/lib/maps";

type Row = Business & {
  profile?: Profile;
  email?: string;
  team: (BusinessMember & { profile?: Profile })[];
};

const TONE: Record<BusinessStatus, "ok" | "gray"> = { active: "ok", suspended: "gray" };

/**
 * patch_v22 made the CNIC and the premises mandatory, but did not evict
 * businesses granted before it — cutting off an account that is already
 * trading would be the wrong migration. They surface here instead.
 */
function missingBits(b: Business): string[] {
  const gaps: string[] = [];
  if (!b.cnic_no) gaps.push("CNIC");
  if (!b.address) gaps.push("address");
  if (b.lat == null || b.lng == null) gaps.push("map pin");
  return gaps;
}
const incomplete = (b: Business) => missingBits(b).length > 0;

export default function AdminBusinesses() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [fetching, setFetching] = useState(true);
  const [grantId, setGrantId] = useState("");
  // A business is a real trading entity, so the account cannot exist without
  // an owner's CNIC and pinned premises. Collected here because there is no
  // self-service signup: the admin granting the account is the one who
  // verifies it.
  const [cnic, setCnic] = useState("");
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState<LatLng | null>(null);
  const autoSeed = useRef(true);
  const [editing, setEditing] = useState<Row | null>(null);
  // Optional at grant time: blank means the company follows the platform
  // default, which is what most of them will do.
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The platform rates a COMPANY with no override of its own follows.
  // Technicians have their own pair, edited on the Providers tab.
  const [defaults, setDefaults] = useState<RatePair>(DEFAULT_COMMISSION.business);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [noSettings, setNoSettings] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: settings, error: setErr } = await supabase
      .from("platform_settings")
      .select(PLATFORM_RATE_COLUMNS)
      .maybeSingle();
    const ps = (settings as PlatformSettings | null) ?? null;
    setNoSettings(!!setErr || !ps);
    setDefaults(ratePairOf(ps, "business"));
    setUpdatedAt(ps?.updated_at ?? null);
    const { data: bizRows } = await supabase
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (bizRows as Business[]) || [];

    if (!list.length) {
      setRows([]);
      setFetching(false);
      return;
    }

    const ids = list.map((b) => b.profile_id);
    const [{ data: members }, { data: owners }] = await Promise.all([
      supabase.from("business_members").select("*").in("business_id", ids),
      supabase.from("profiles").select("*").in("id", ids),
    ]);
    const team = (members as BusinessMember[]) || [];

    // One more read for the technicians' names; `bm_admin` already let us see
    // the membership rows themselves.
    const techIds = [...new Set(team.map((m) => m.provider_id))];
    const { data: techs } = techIds.length
      ? await supabase.from("profiles").select("*").in("id", techIds)
      : { data: [] };

    const byId = new Map(
      [...((owners as Profile[]) || []), ...((techs as Profile[]) || [])].map((p) => [p.id, p])
    );
    // Owners and technicians both, so a business can be found by the email
    // of anyone on it.
    const emails = await fetchEmails(supabase, [...ids, ...techIds]);
    setRows(
      list.map((b) => ({
        ...b,
        profile: byId.get(b.profile_id),
        email: emails.get(b.profile_id),
        team: team
          .filter((m) => m.business_id === b.profile_id && m.status !== "removed")
          .map((m) => ({ ...m, profile: byId.get(m.provider_id) })),
      }))
    );
    setFetching(false);
  }, []);

  useEffect(() => {
    // Wrapped so nothing in load() runs synchronously in the effect body —
    // every setState in it is behind an await. Same shape as /pro/history.
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * Granting takes the profile id, not an email. `admin_emails` (patch_v20)
   * resolves addresses for accounts already on screen, but deliberately maps
   * id -> email and not the reverse: a lookup keyed on an email would answer
   * "does this person have an account here?" for whoever could call it. The
   * id is a copy-paste from Supabase -> Authentication -> Users, the same
   * place the first admin comes from.
   */
  async function grant() {
    const id = grantId.trim();
    if (!id) return;
    if (!isValidCnic(cnic)) {
      toast("Enter the owner's 13-digit CNIC, e.g. 42101-1234567-1", "error");
      return;
    }
    if (address.trim().length < 5) {
      toast("Enter the address of the premises.", "error");
      return;
    }
    if (!pin) {
      toast("Pin the premises on the map.", "error");
      return;
    }
    const badRate = validatePercent(rate);
    if (badRate) {
      toast(badRate, "error");
      return;
    }
    setBusy("grant");
    const fn = editing ? "update_business_details" : "grant_business_account";
    const { error } = await createClient().rpc(fn, {
      p_profile: editing ? editing.profile_id : id,
      p_cnic: cnic.trim(),
      p_address: address.trim(),
      p_lat: pin.lat,
      p_lng: pin.lng,
    });
    if (error) {
      setBusy(null);
      toast(error.message, "error");
      return;
    }

    // A second call rather than another argument on grant_business_account:
    // set_account_commission is already the audited, admin-only write path
    // for this column, and it is the same one the row's own field uses.
    const wanted = fromPercent(rate);
    if (wanted !== null) {
      const target = editing ? editing.profile_id : id;
      const { error: rateErr } = await createClient().rpc("set_account_commission", {
        p_profile: target,
        p_rate: wanted,
      });
      if (rateErr) {
        setBusy(null);
        // The account exists either way, so say what did and didn't land.
        toast(`Account saved, but the commission didn't: ${rateErr.message}`, "error");
        await load();
        return;
      }
    }

    setBusy(null);
    setGrantId(""); setCnic(""); setAddress(""); setPin(null); setRate(""); setEditing(null);
    autoSeed.current = true;
    toast(editing ? "Details updated." : "Business account granted.", "success");
    await load();
  }

  // Patched in place rather than reloading, so a long list doesn't jump.
  function applyRate(id: string, rate: number | null) {
    setRows((rs) => rs.map((r) => (r.profile_id === id ? { ...r, commission_rate: rate } : r)));
  }

  function editDetails(r: Row) {
    setEditing(r);
    setCnic(r.cnic_no ?? "");
    setAddress(r.address ?? "");
    setPin(r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null);
    setRate(toPercent(r.commission_rate));
    autoSeed.current = r.lat == null;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function setStatus(id: string, status: BusinessStatus) {
    setBusy(id);
    const { error } = await createClient().rpc("set_business_status", {
      p_profile: id,
      p_status: status,
    });
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    await load();
  }

  // Matches on the owner, and on any technician's name or phone, so a
  // support request that quotes a technician still finds the company.
  const found = rows.filter(
    (r) =>
      matchesQuery(query, { name: r.profile?.full_name, phone: r.profile?.phone, email: r.email }) ||
      r.team.some((m) =>
        matchesQuery(query, { name: m.profile?.full_name, phone: m.profile?.phone })
      )
  );

  return (
    <AdminShell>
      <DefaultCommissionCard
        scope="business"
        value={defaults}
        missing={noSettings}
        updatedAt={updatedAt}
        onSaved={setDefaults}
      />

      <Card className="mt-8">
        <h2 className="text-xl font-bold tracking-tight">
          {editing
            ? `Edit ${editing.profile?.full_name ?? "business"} details`
            : "Grant a business account"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Businesses are created by hand — there is no public signup, so you are the one
          verifying them. A business is a real trading entity: record the owner&apos;s CNIC and
          the premises it operates from. The account must already exist, and must not be an
          approved technician.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {!editing && (
            <Field label="User id" hint="Supabase → Authentication → Users → copy the UID">
              <Input
                value={grantId}
                onChange={(e) => setGrantId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                aria-label="User id"
              />
            </Field>
          )}
          <Field label="Owner's CNIC" hint="13 digits">
            <Input
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              placeholder="42101-1234567-1"
              inputMode="numeric"
              aria-label="Owner CNIC"
            />
          </Field>
          <Field
            label="Commission"
            hint={`Optional. Blank follows the ${toPercent(defaults.fixed)}% / ${toPercent(
              defaults.custom
            )}% default.`}
          >
            <Input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={toPercent(defaults.fixed)}
              inputMode="decimal"
              suffix="%"
              aria-label="Commission percentage"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Premises address">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop 12, Block 4, Gulshan-e-Iqbal"
                aria-label="Premises address"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Pin the premises" hint="The shop or office, not a customer address.">
              <MapPicker
                value={pin}
                onChange={(next, found) => {
                  // MapPicker centres on Karachi when it opens with no pin and
                  // fires onChange immediately; that is not an admin choice.
                  if (autoSeed.current) {
                    autoSeed.current = false;
                    return;
                  }
                  setPin(next);
                  // The picker reverse-geocodes. Offer that as a starting
                  // point, but never overwrite what the admin typed.
                  if (found) setAddress((prev) => (prev.trim() ? prev : found));
                }}
              />
            </Field>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={busy === "grant" || (!editing && !grantId.trim())} onClick={grant}>
            {editing ? "Save details" : "Grant"}
          </Button>
          {editing && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null); setCnic(""); setAddress(""); setPin(null); setRate("");
                autoSeed.current = true;
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Business accounts</h2>
          <span className="text-xs text-muted-foreground">
            {query.trim() ? `${found.length} of ${rows.length}` : `${rows.length} total`}
          </span>
        </div>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or phone"
          aria-label="Search businesses"
          prefix={<Icon name="search" size="sm" />}
          className="mb-4"
        />

        {fetching ? (
          <Spinner />
        ) : found.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              icon="building"
              title="No business accounts yet"
              hint="Grant one above to let a company dispatch jobs to its own technicians."
            />
          ) : (
            <EmptyState
              icon="search"
              title="No match"
              hint={`Nothing matches "${query.trim()}". Try an email, a phone number, or part of a name.`}
            />
          )
        ) : (
          <div className="flex flex-col gap-4">
            {found.map((r) => (
              <Card key={r.profile_id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={r.profile?.full_name} src={r.profile?.avatar_url} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold">
                          {r.profile?.full_name ?? "Unnamed business"}
                        </h3>
                        <Pill tone={TONE[r.status]}>{r.status}</Pill>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.email ?? r.profile?.phone ?? "no contact"}
                        {r.email && r.profile?.phone ? ` · ${r.profile.phone}` : ""} ·{" "}
                        {r.team.filter((m) => m.status === "active").length} on the team
                      </p>
                      {/* `jobs_completed` is a RATING count, not a job count —
                          on_review_change maintains it from `reviews`, exactly
                          as providers.jobs_completed does despite its name.
                          Labelling it "jobs dispatched" would contradict the
                          business's own /business/earnings figure. */}
                      <p className="mt-1 text-xs text-muted-foreground">
                        <Rating value={r.rating_avg} /> · {r.jobs_completed}{" "}
                        {r.jobs_completed === 1 ? "rating" : "ratings"}
                      </p>
                      {/* Accounts granted before the premises became mandatory
                          keep trading, but they are the ones to chase. */}
                      {incomplete(r) ? (
                        <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-500">
                          Missing {missingBits(r).join(", ")} — granted before these were
                          required. Add them so the business can be placed on a map.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          CNIC {r.cnic_no} · {r.address}
                        </p>
                      )}
                      <CommissionField
                        profileId={r.profile_id}
                        value={r.commission_rate ?? null}
                        defaults={defaults}
                        onSaved={(rate) => applyRate(r.profile_id, rate)}
                      />
                      {r.team.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
                          {r.team.map((m) => (
                            <li key={m.id}>
                              {m.profile?.full_name ?? "Unnamed"} ·{" "}
                              <span className={m.status === "active" ? "" : "italic"}>
                                {m.status}
                              </span>{" "}
                              · keeps {Math.round(m.tech_share * 100)}%
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={incomplete(r) ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => editDetails(r)}
                    >
                      {incomplete(r) ? "Complete details" : "Edit details"}
                    </Button>
                    {r.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === r.profile_id}
                        onClick={() => setStatus(r.profile_id, "suspended")}
                      >
                        Suspend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy === r.profile_id}
                        onClick={() => setStatus(r.profile_id, "active")}
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
