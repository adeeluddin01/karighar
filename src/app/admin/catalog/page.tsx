"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { Button, Card, EmptyState, Input, Pill } from "@/components/ui";
import type { Service, ServiceCategory } from "@/lib/types";

export default function AdminCatalog() {
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("service_categories").select("*").order("sort_order"),
      supabase.from("services").select("*"),
    ]);
    setCats((c as ServiceCategory[]) || []);
    setServices((s as Service[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function savePrice(svc: Service) {
    const raw = edits[svc.id];
    if (raw === undefined) return;
    setBusy(svc.id);
    const value = raw === "" ? null : Number(raw);
    await createClient().from("services").update({ base_price: value }).eq("id", svc.id);
    await load();
    setBusy(null);
  }

  async function toggleActive(svc: Service) {
    setBusy(svc.id);
    await createClient().from("services").update({ is_active: !svc.is_active }).eq("id", svc.id);
    await load();
    setBusy(null);
  }

  if (cats.length === 0) {
    return (
      <AdminShell>
        <EmptyState
          icon="file"
          title="No catalog yet"
          hint="Run supabase/schema.sql to seed the Karachi service catalog."
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-8">
        {cats.map((cat) => (
          <section key={cat.id}>
            <h2 className="mb-4 text-xl font-bold tracking-tight">{cat.name}</h2>
            <div className="flex flex-col gap-3">
              {services
                .filter((s) => s.category_id === cat.id)
                .map((svc) => (
                  <Card key={svc.id}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold">{svc.name}</span>
                          {!svc.is_active && <Pill tone="bad">Hidden</Pill>}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {svc.description} · per {svc.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-32"
                          type="number"
                          inputMode="numeric"
                          prefix="Rs"
                          defaultValue={svc.base_price ?? ""}
                          placeholder="quote"
                          aria-label={`Base price for ${svc.name}`}
                          onChange={(e) => setEdits((p) => ({ ...p, [svc.id]: e.target.value }))}
                        />
                        <Button size="sm" disabled={busy === svc.id} onClick={() => savePrice(svc)}>
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === svc.id}
                          onClick={() => toggleActive(svc)}
                        >
                          {svc.is_active ? "Hide" : "Show"}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
