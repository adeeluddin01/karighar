"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  KV,
  PageHeader,
  Pill,
  Spinner,
  Textarea,
} from "@/components/ui";
import { KARACHI_AREAS, type ServiceCategory, type Provider } from "@/lib/types";
import { LIMITS, formatCnic, firstError, validateCnic, validateFreeText } from "@/lib/validate";
import { dbErrorMessage } from "@/lib/dbErrors";
import {
  VERIFICATION_ACCEPT,
  uploadVerificationDoc,
  validateVerificationDoc,
  type DocKind,
} from "@/lib/verificationDoc";

export default function ProviderOnboardingPage() {
  const { user, loading } = useRequireAuth("/pro/onboarding");
  const router = useRouter();

  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [existing, setExisting] = useState<Provider | null>(null);
  const [bio, setBio] = useState("");
  const [cnic, setCnic] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [cnicFront, setCnicFront] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const [{ data: catData }, { data: prov }] = await Promise.all([
        supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("providers").select("*").eq("profile_id", user.id).maybeSingle(),
      ]);
      setCats((catData as ServiceCategory[]) || []);
      if (prov) {
        const p = prov as Provider;
        setExisting(p);
        setBio(p.bio ?? "");
        setCnic(p.cnic_no ?? "");
        setAreas(p.service_areas ?? []);
      }
    })();
  }, [user]);

  // Reject a bad file at pick time rather than at submit: the person is
  // looking at the file picker right now, and a 20MB photo is worth saying
  // something about before they fill in the rest of the form.
  function pickDoc(file: File | null, set: (f: File | null) => void) {
    if (!file) {
      set(null);
      return;
    }
    const bad = validateVerificationDoc(file);
    if (bad) {
      setError(bad);
      set(null);
      return;
    }
    setError(null);
    set(file);
  }

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function tryUpload(file: File | null, kind: DocKind): Promise<string | null> {
    if (!file || !user) return null;
    const { path, error } = await uploadVerificationDoc(createClient(), user.id, kind, file);
    if (error) {
      setWarn(
        `Documents couldn't be uploaded (${error}) — you can add them later. Your profile was still submitted.`
      );
      return null;
    }
    return path;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (selectedCats.length === 0) {
      setError("Pick at least one service you offer.");
      return;
    }
    // The file checks run here too, not just on pick: a file chosen before a
    // re-render could otherwise reach the bucket unvalidated.
    const bad = firstError(
      validateCnic(cnic),
      validateFreeText(bio, { max: LIMITS.bio, label: "bio" }),
      cnicFront ? validateVerificationDoc(cnicFront) : null,
      selfie ? validateVerificationDoc(selfie) : null
    );
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError(null);
    setWarn(null);
    const supabase = createClient();

    await supabase.from("profiles").update({ role: "provider" }).eq("id", user.id);

    const frontPath = await tryUpload(cnicFront, "cnic-front");
    const selfiePath = await tryUpload(selfie, "selfie");

    const { error: provErr } = await supabase.from("providers").upsert(
      {
        profile_id: user.id,
        cnic_no: cnic.trim(),
        bio: bio.trim(),
        service_areas: areas,
        status: "pending",
        ...(frontPath ? { cnic_front_url: frontPath } : {}),
        ...(selfiePath ? { selfie_url: selfiePath } : {}),
      },
      { onConflict: "profile_id" }
    );
    if (provErr) {
      setError(dbErrorMessage(provErr));
      setBusy(false);
      return;
    }

    // Map chosen categories -> all their services -> provider_services.
    const { data: svcs } = await supabase
      .from("services")
      .select("id")
      .in("category_id", selectedCats);
    const rows = (svcs as { id: string }[]).map((s) => ({ provider_id: user.id, service_id: s.id }));
    if (rows.length)
      await supabase
        .from("provider_services")
        .upsert(rows, { onConflict: "provider_id,service_id" });

    router.push("/pro/dashboard");
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
      <PageHeader
        title={existing ? "Update your pro profile" : "Set up your pro profile"}
        subtitle={
          existing?.status === "approved"
            ? "You're approved and live 🎉"
            : "We'll review your details and verify you (usually 1–2 days)."
        }
      />

      {existing && (
        <Card className="mb-6">
          <KV label="Verification status">
            <Pill tone={existing.status === "approved" ? "ok" : existing.status === "pending" ? "warn" : "bad"}>
              {existing.status}
            </Pill>
          </KV>
        </Card>
      )}

      <form onSubmit={submit} className="space-y-5">
        <Field label="Short bio" hint="Tell customers about your experience.">
          <Textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={LIMITS.bio}
            placeholder="e.g. 8 years of AC service & installation experience across Karachi."
          />
        </Field>

        <div>
          <p className="lbl mb-3">Services you offer</p>
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
          <p className="lbl mb-3">Areas you cover</p>
          <div className="flex flex-wrap gap-2">
            {KARACHI_AREAS.map((a) => (
              <Chip key={a} active={areas.includes(a)} onClick={() => toggle(areas, setAreas, a)}>
                {a}
              </Chip>
            ))}
          </div>
        </div>

        <Field label="CNIC number">
          <Input
            value={cnic}
            onChange={(e) => setCnic(formatCnic(e.target.value))}
            required
            inputMode="numeric"
            maxLength={LIMITS.cnic}
            placeholder="42101-1234567-1"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="CNIC photo" hint="Front side">
            <div className="field">
              <input
                type="file"
                accept={VERIFICATION_ACCEPT}
                onChange={(e) => pickDoc(e.target.files?.[0] ?? null, setCnicFront)}
                className="text-sm"
              />
            </div>
          </Field>
          <Field label="Selfie" hint="Clear face photo">
            <div className="field">
              <input
                type="file"
                accept={VERIFICATION_ACCEPT}
                onChange={(e) => pickDoc(e.target.files?.[0] ?? null, setSelfie)}
                className="text-sm"
              />
            </div>
          </Field>
        </div>

        {warn && (
          <p className="rounded-xl bg-warning-light p-3 text-sm text-warning-foreground">{warn}</p>
        )}
        {error && <p className="errtxt">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Submitting…" : existing ? "Save changes" : "Submit for verification"}
        </Button>
      </form>
    </AppShell>
  );
}
