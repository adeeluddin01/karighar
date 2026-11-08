"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { Avatar, Button, Chip, Field, Input, KV, Pill, Rating, Spinner, Textarea } from "@/components/ui";
import { dbErrorMessage } from "@/lib/dbErrors";
import {
  LIMITS,
  firstError,
  formatCnic,
  isValidCnic,
  normalizePkPhone,
  validateCnic,
  validateFreeText,
  validateName,
  validatePhone,
} from "@/lib/validate";
import { categoriesOf, serviceIdsFor, tradesChanged, tradesDiff } from "@/lib/providerTrades";
import { signedVerificationUrl } from "@/lib/verificationDoc";
import {
  KARACHI_AREAS,
  type Profile,
  type Provider,
  type Service,
  type ServiceCategory,
} from "@/lib/types";

export type ProviderRow = Provider & { profile?: Profile; email?: string };

/* ============================================================
   The Pro's application, as the admin sees it.

   Until this existed an admin approved a technician on a typed-in CNIC
   string alone: the CNIC photo and the selfie were uploaded by
   /pro/onboarding and then read by nothing, anywhere. They are the reason
   the `verification` bucket exists, and `verif_read` has always admitted
   `is_admin()` — only the client code was missing.

   A modal rather than a page: there is no "create a Pro" (applications only
   arrive from onboarding), so this is pure edit, and the admin keeps their
   place in a long list. Follows the catalog editor's shape.
   ============================================================ */
export function ProviderDetailModal({
  row,
  onClose,
  onSaved,
}: {
  row: ProviderRow;
  onClose: () => void;
  /** Reload the list — status, name and trades may all have moved. */
  onSaved: () => void;
}) {
  const toast = useToast();
  const id = row.profile_id;

  const [fullName, setFullName] = useState(row.profile?.full_name ?? "");
  const [phone, setPhone] = useState(row.profile?.phone ?? "");
  const [bio, setBio] = useState(row.bio ?? "");
  // Loaded VERBATIM, not through formatCnic: that helper truncates to 13
  // digits, so a longer legacy value would silently show as something other
  // than what is stored the moment the modal opened. Masking starts on the
  // first keystroke instead.
  const [cnic, setCnic] = useState(row.cnic_no ?? "");
  const [areas, setAreas] = useState<string[]>(row.service_areas ?? []);

  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  // Both baselines as loaded: the categories decide whether anything moved,
  // the service ids are what the diff is actually computed against.
  const [originalCats, setOriginalCats] = useState<string[]>([]);
  const [ownedServiceIds, setOwnedServiceIds] = useState<string[]>([]);

  const [docs, setDocs] = useState<{
    front: string | null;
    back: string | null;
    selfie: string | null;
  }>({ front: null, back: null, selfie: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: c }, { data: s }, { data: ps }, front, back, selfie] = await Promise.all([
      supabase.from("service_categories").select("*").order("sort_order"),
      supabase.from("services").select("*"),
      supabase.from("provider_services").select("service_id").eq("provider_id", id),
      // Signed on open, never on list load: minting document URLs for every
      // provider in a list would be a bulk credential leak with no reader.
      signedVerificationUrl(supabase, row.cnic_front_url),
      signedVerificationUrl(supabase, row.cnic_back_url),
      signedVerificationUrl(supabase, row.selfie_url),
    ]);
    const svcList = (s as Service[]) || [];
    setCats((c as ServiceCategory[]) || []);
    setServices(svcList);
    const owned = ((ps as { service_id: string }[]) || []).map((r) => r.service_id);
    const mine = categoriesOf(owned, svcList);
    setSelectedCats(mine);
    setOriginalCats(mine);
    setOwnedServiceIds(owned);
    setDocs({ front, back, selfie });
    setLoading(false);
  }, [id, row.cnic_front_url, row.cnic_back_url, row.selfie_url]);

  useEffect(() => {
    // Wrapped so nothing in load() runs synchronously in the effect body —
    // every setState in it is behind an await. Same shape as /business/team.
    void (async () => {
      await load();
    })();
  }, [load]);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    const bad = firstError(
      validateName(fullName),
      phone.trim() ? validatePhone(phone) : null,
      validateCnic(cnic),
      validateFreeText(bio, { max: LIMITS.bio, label: "bio" })
    );
    if (bad) {
      toast(bad, "error");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    // 1. The application itself. `.select().single()` so a write the policy
    //    refuses comes back as an error instead of a silent 0-row success —
    //    the admin would otherwise be told "Saved" over a no-op.
    const { error: provErr } = await supabase
      .from("providers")
      .update({
        bio: bio.trim() || null,
        cnic_no: cnic.trim() || null,
        service_areas: areas,
      })
      .eq("profile_id", id)
      .select("profile_id")
      .single();
    if (provErr) {
      toast(dbErrorMessage(provErr), "error");
      setBusy(false);
      return;
    }

    // 2. Trades — the only non-atomic step, so it goes last and is skipped
    //    entirely when the selection never moved.
    //
    //    ADD BEFORE REMOVE, and a diff rather than delete-everything. There
    //    is no transaction across these two calls, so one of them can land
    //    alone. Adding first means an interrupted save leaves a SUPERSET —
    //    the pro is still findable for work they do offer, plus some they
    //    have dropped, and a retry fixes it. The other order leaves a
    //    subset, possibly empty, and a pro who has silently vanished from
    //    the open pool is a failure nobody notices.
    if (tradesChanged(originalCats, selectedCats)) {
      const desired = serviceIdsFor(selectedCats, services);
      const { toAdd, toRemove } = tradesDiff(ownedServiceIds, desired);

      if (toAdd.length) {
        const { error: addErr } = await supabase
          .from("provider_services")
          .upsert(
            toAdd.map((sid) => ({ provider_id: id, service_id: sid })),
            { onConflict: "provider_id,service_id" }
          );
        if (addErr) {
          toast(
            `Everything was saved except the trades: ${dbErrorMessage(addErr)}. The old trades are untouched.`,
            "error"
          );
          setBusy(false);
          onSaved();
          return;
        }
      }

      if (toRemove.length) {
        const { error: rmErr } = await supabase
          .from("provider_services")
          .delete()
          .eq("provider_id", id)
          .in("service_id", toRemove);
        if (rmErr) {
          toast(
            `Saved, but some trades couldn't be removed: ${dbErrorMessage(rmErr)}. This pro is still listed under them.`,
            "error"
          );
          setBusy(false);
          onSaved();
          return;
        }
      }

      setOriginalCats(selectedCats);
      setOwnedServiceIds(desired);
    }

    // 3. Name and phone live on `profiles`, where an admin has no RLS write
    //    (profiles_upd is owner-only) — hence the definer RPC from
    //    patch_v28. Only called when something actually changed.
    const normPhone = phone.trim() ? normalizePkPhone(phone) : null;
    const nameMoved = fullName.trim() !== (row.profile?.full_name ?? "").trim();
    const phoneMoved = (normPhone ?? "") !== (row.profile?.phone ?? "");
    if (nameMoved || phoneMoved) {
      const { error: rpcErr } = await supabase.rpc("admin_update_provider_contact", {
        p_profile: id,
        p_full_name: fullName.trim(),
        p_phone: normPhone,
      });
      if (rpcErr) {
        toast(`Application saved, but the name and phone didn't: ${dbErrorMessage(rpcErr)}`, "error");
        setBusy(false);
        onSaved();
        return;
      }
    }

    setBusy(false);
    toast("Application updated.", "success");
    onSaved();
    onClose();
  }

  return (
    <Modal
      title={row.profile?.full_name ?? "Unnamed provider"}
      subtitle={row.email ?? "no email on file"}
      onClose={onClose}
      size="lg"
    >
      {loading ? (
        <Spinner label="Loading the application…" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Avatar name={row.profile?.full_name} src={row.profile?.avatar_url} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={row.status === "approved" ? "ok" : row.status === "pending" ? "warn" : "bad"}>
                  {row.status}
                </Pill>
                <Rating value={row.rating_avg} />
                <span className="text-xs text-muted-foreground">{row.jobs_completed} jobs</span>
              </div>
              {/* The admin list sorts by this but has never shown it. */}
              <p className="mt-1 text-xs text-muted-foreground">
                {row.verified_at
                  ? `Verified ${new Date(row.verified_at).toLocaleDateString("en-GB")}`
                  : "Not verified yet"}
              </p>
            </div>
          </div>

          {/* FIRST, above the form. An admin opens this to look at the ID
              and decide, and the CNIC field below is typed by reading the
              number off these. Putting the documents last — schema order —
              meant scrolling past six fields to reach the only thing that
              actually settles an approval. */}
          <div>
            <label className="lbl mb-2 block">Identity documents</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <DocView label="CNIC front" icon="idcard" path={row.cnic_front_url} url={docs.front} />
              <DocView label="Selfie" icon="camera" path={row.selfie_url} url={docs.selfie} />
              {/* Always shown, though nothing writes it: an admin who can't
                  find the back of the card should learn the form never asked
                  rather than conclude the pro withheld it. */}
              <DocView
                label="CNIC back"
                icon="idcard"
                path={row.cnic_back_url}
                url={docs.back}
                absentNote="The onboarding form doesn't ask for this."
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={LIMITS.fullName}
                aria-label="Full name"
              />
            </Field>
            <Field label="Phone" hint="Saved as +92…">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                maxLength={18}
                placeholder="03XX-XXXXXXX"
                aria-label="Phone"
              />
            </Field>
          </div>

          <Field
            label="CNIC number"
            error={
              // Rows predate patch_v27's 13-digit CHECK. Say so where the
              // admin can act on it — they are the one person holding the
              // photo that has the real number on it.
              cnic.trim() && !isValidCnic(cnic)
                ? "This CNIC isn't 13 digits — correct it from the document above before saving."
                : undefined
            }
          >
            <Input
              value={cnic}
              onChange={(e) => setCnic(formatCnic(e.target.value))}
              inputMode="numeric"
              maxLength={LIMITS.cnic}
              placeholder="42101-1234567-1"
              aria-label="CNIC number"
            />
          </Field>

          <Field label="Bio">
            <Textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={LIMITS.bio}
              aria-label="Bio"
            />
          </Field>

          <div>
            <label className="lbl mb-2 block">Trades</label>
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => (
                <Chip
                  key={c.id}
                  active={selectedCats.includes(c.id)}
                  onClick={() => toggle(selectedCats, setSelectedCats, c.id)}
                >
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="lbl mb-2 block">Areas covered</label>
            <div className="flex flex-wrap gap-2">
              {KARACHI_AREAS.map((a) => (
                <Chip key={a} active={areas.includes(a)} onClick={() => toggle(areas, setAreas, a)}>
                  {a}
                </Chip>
              ))}
            </div>
          </div>


          <KV label="Account id">
            <span className="font-mono text-xs">{id}</span>
          </KV>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * One identity document, or a placeholder.
 *
 * A null URL means the column was empty OR the signed-URL request failed —
 * both render the same way on purpose. Documents are optional at onboarding,
 * so "not uploaded" is an ordinary state, not an error worth alarming over.
 */
function DocView({
  label,
  icon,
  path,
  url,
  absentNote,
}: {
  label: string;
  icon: "idcard" | "camera";
  /** The stored storage key, re-signed on demand for a full-size view. */
  path: string | null;
  url: string | null;
  absentNote?: string;
}) {
  const [broken, setBroken] = useState(false);
  const [opening, setOpening] = useState(false);

  // A fresh signature rather than reusing the thumbnail's URL: the modal can
  // sit open far longer than the five-minute TTL while an admin types, and a
  // stale link opens a Storage XML error in a new tab.
  async function openFullSize() {
    setOpening(true);
    const fresh = await signedVerificationUrl(createClient(), path);
    setOpening(false);
    if (!fresh) {
      setBroken(true);
      return;
    }
    window.open(fresh, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon name={icon} size="sm" />
        {label}
      </div>
      {url && !broken ? (
        <>
          {/* Plain <img>: next/image needs a loader this static export has
              no server for, which is why images.unoptimized is set. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="max-h-56 w-full rounded-lg object-contain"
            onError={() => setBroken(true)}
          />
          <button
            type="button"
            onClick={openFullSize}
            disabled={opening}
            className="mt-2 text-xs text-primary underline"
          >
            {opening ? "Opening…" : "View full size"}
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {absentNote ?? (path ? "Couldn't load this document." : "Not uploaded")}
        </p>
      )}
    </div>
  );
}
