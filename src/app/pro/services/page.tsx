"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Chip, PageHeader, Pill, Spinner } from "@/components/ui";
import { MapPicker } from "@/components/maps/MapPicker";
import type { LatLng } from "@/lib/maps";
import { DISPATCH_START_KM } from "@/lib/dispatch";
import { KARACHI_AREAS, type ServiceCategory, type Service } from "@/lib/types";
import { useLanguage } from "@/lib/i18n";

export default function ProviderServicesPage() {
  const { user, profile, loading } = useRequireAuth("/pro/services");
  const router = useRouter();
  const { t } = useLanguage();

  // Pro-area page: a signed-in non-provider opening the URL directly gets
  // their own home, not an empty services editor they could write junk
  // rows into. Pending providers pass — the check is profile.role, not
  // approval status.
  useEffect(() => {
    if (!loading && profile && profile.role !== "provider") {
      router.replace(
        profile.role === "customer" ? "/" : profile.role === "business" ? "/business" : "/admin",
      );
    }
  }, [loading, profile, router]);
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  // Where the dispatch ring centres for this pro. Null means it falls back
  // to the mean centre of their areas, which is a kilometre or two out.
  const [base, setBase] = useState<LatLng | null>(null);
  // MapPicker fires onChange(KARACHI_CENTER) on mount when it has no pin, so
  // the first callback is swallowed — otherwise opening this page would
  // silently "set" a location nobody chose. Same trick as /admin/businesses.
  const autoSeed = useRef(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const [{ data: c }, { data: s }, { data: prov }, { data: ps }] = await Promise.all([
      supabase.from("service_categories").select("*").order("sort_order"),
      supabase.from("services").select("*"),
      supabase.from("providers").select("service_areas,lat,lng").eq("profile_id", user.id).maybeSingle(),
      supabase.from("provider_services").select("service_id").eq("provider_id", user.id),
    ]);
    const svcList = (s as Service[]) || [];
    setCats((c as ServiceCategory[]) || []);
    setServices(svcList);
    const provRow = prov as { service_areas: string[]; lat: number | null; lng: number | null } | null;
    setAreas(provRow?.service_areas || []);
    if (provRow?.lat != null && provRow?.lng != null) {
      setBase({ lat: provRow.lat, lng: provRow.lng });
      autoSeed.current = false;
    }
    const myServiceIds = new Set(((ps as { service_id: string }[]) || []).map((r) => r.service_id));
    const myCats = new Set(
      svcList.filter((sv) => myServiceIds.has(sv.id)).map((sv) => sv.category_id)
    );
    setSelectedCats([...myCats]);
  }, [user]);

  useEffect(() => {
    // Wrapped so nothing in load() runs synchronously in the effect body —
    // every setState in it is behind an await. Same shape as /business/team.
    void (async () => {
      await load();
    })();
  }, [load]);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    setSaved(false);
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    setSaved(false);
    const supabase = createClient();
    await supabase
      .from("providers")
      .update({
        service_areas: areas,
        // Both or neither — providers_latlng_pair enforces that in the
        // database too, so sending one alone would be rejected outright.
        lat: base?.lat ?? null,
        lng: base?.lng ?? null,
      })
      .eq("profile_id", user.id);

    const desired = services.filter((s) => selectedCats.includes(s.category_id)).map((s) => s.id);
    // Remove services no longer offered, then upsert the current set.
    await supabase.from("provider_services").delete().eq("provider_id", user.id);
    if (desired.length) {
      await supabase
        .from("provider_services")
        .upsert(desired.map((id) => ({ provider_id: user.id, service_id: id })), {
          onConflict: "provider_id,service_id",
        });
    }
    setBusy(false);
    setSaved(true);
  }

  if (!loading && profile && profile.role !== "provider") return null;

  if (loading || !user) {
    return (
      <AppShell>
        <Spinner label={t("services.loading")} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title={t("services.title")} subtitle={t("services.subtitle")} />

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">{t("services.offer")}</h2>
          <span className="text-xs text-muted-foreground">{selectedCats.length} {t("services.selected")}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
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
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-bold">Where you work from</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          New jobs go to pros within {DISPATCH_START_KM}km first, and the
          circle widens every few minutes until someone takes them. Drop a pin
          and you&apos;ll see nearby work before anyone further out.
        </p>
        {!base && (
          <p className="mt-2 text-sm text-warning-foreground">
            No pin yet — we&apos;re using the middle of the areas you cover,
            which can be a kilometre or two off.
          </p>
        )}
        <div className="mt-4">
          <MapPicker
            value={base}
            onChange={(pos) => {
              if (autoSeed.current) {
                autoSeed.current = false;
                return;
              }
              setSaved(false);
              setBase(pos);
            }}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">{t("services.areas")}</h2>
          <span className="text-xs text-muted-foreground">{areas.length} {t("services.selected")}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {KARACHI_AREAS.map((a) => (
            <Chip key={a} active={areas.includes(a)} onClick={() => toggle(areas, setAreas, a)}>
              {a}
            </Chip>
          ))}
        </div>
      </Card>

      <div className="mt-6 flex items-center gap-3">
        <Button disabled={busy} onClick={save}>
          {busy ? t("profile.saving") : t("profile.saveChanges")}
        </Button>
        {saved && (
          <Pill tone="ok" icon="check">
            {t("profile.saved")}
          </Pill>
        )}
      </div>
    </AppShell>
  );
}
