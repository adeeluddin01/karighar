"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Chip, PageHeader, Pill, Spinner } from "@/components/ui";
import { KARACHI_AREAS, type ServiceCategory, type Service } from "@/lib/types";

export default function ProviderServicesPage() {
  const { user, loading } = useRequireAuth("/pro/services");
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const [{ data: c }, { data: s }, { data: prov }, { data: ps }] = await Promise.all([
      supabase.from("service_categories").select("*").order("sort_order"),
      supabase.from("services").select("*"),
      supabase.from("providers").select("service_areas").eq("profile_id", user.id).maybeSingle(),
      supabase.from("provider_services").select("service_id").eq("provider_id", user.id),
    ]);
    const svcList = (s as Service[]) || [];
    setCats((c as ServiceCategory[]) || []);
    setServices(svcList);
    setAreas((prov as { service_areas: string[] } | null)?.service_areas || []);
    const myServiceIds = new Set(((ps as { service_id: string }[]) || []).map((r) => r.service_id));
    const myCats = new Set(
      svcList.filter((sv) => myServiceIds.has(sv.id)).map((sv) => sv.category_id)
    );
    setSelectedCats([...myCats]);
  }, [user]);

  useEffect(() => {
    load();
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
    await supabase.from("providers").update({ service_areas: areas }).eq("profile_id", user.id);

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

  if (loading || !user) {
    return (
      <AppShell>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="My services" subtitle="Choose what you offer and where you work." />

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Services you offer</h2>
          <span className="text-xs text-muted-foreground">{selectedCats.length} selected</span>
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
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Areas you cover</h2>
          <span className="text-xs text-muted-foreground">{areas.length} selected</span>
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
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {saved && (
          <Pill tone="ok" icon="check">
            Saved
          </Pill>
        )}
      </div>
    </AppShell>
  );
}
