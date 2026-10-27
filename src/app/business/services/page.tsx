"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/useUser";
import { BusinessShell } from "@/components/BusinessShell";
import { useToast } from "@/components/Toast";
import { Button, Card, Chip, Pill, Spinner } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";
import { CATEGORY_ICON_WEB, CATEGORY_ICON_FALLBACK } from "@/lib/catalogIcons";
import { KARACHI_AREAS, type Service, type ServiceCategory } from "@/lib/types";

const webIcon = (slug: string | null) =>
  (CATEGORY_ICON_WEB[slug ?? ""] ?? CATEGORY_ICON_FALLBACK) as IconName;

/**
 * What the company covers, and where.
 *
 * The counterpart of /pro/services — but it carries more weight here,
 * because a business is a PLACE. Its premises are pinned on the customer's
 * map (patch_v22), and these trades are what decide the icon on that pin. A
 * business that picks nothing is still findable; it just reads as general
 * work.
 *
 * Deliberately NOT where the address lives: the premises and the CNIC are
 * recorded by the admin who granted the account and coerced back by
 * `businesses_guard_trusted_cols` on any self-write.
 */
export default function BusinessServicesPage() {
  const { user } = useUser();
  const toast = useToast();
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const [{ data: c }, { data: s }, { data: biz }, { data: mine }] = await Promise.all([
      supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("services").select("*").eq("is_active", true),
      supabase.from("businesses").select("service_areas").eq("profile_id", user.id).maybeSingle(),
      supabase.from("business_services").select("service_id").eq("business_id", user.id),
    ]);
    const svcList = (s as Service[]) ?? [];
    setCats((c as ServiceCategory[]) ?? []);
    setServices(svcList);
    setAreas((biz as { service_areas: string[] } | null)?.service_areas ?? []);
    const ids = new Set(((mine as { service_id: string }[]) ?? []).map((r) => r.service_id));
    setPicked([...new Set(svcList.filter((sv) => ids.has(sv.id)).map((sv) => sv.category_id))]);
    setDirty(false);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    setDirty(true);
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    const supabase = createClient();

    const { error: areaErr } = await supabase
      .from("businesses")
      .update({ service_areas: areas })
      .eq("profile_id", user.id);

    // Replace rather than diff: the set is at most a few dozen rows, and a
    // partial failure that leaves a trade behind is worse than a re-upsert.
    const wanted = services.filter((sv) => picked.includes(sv.category_id)).map((sv) => sv.id);
    await supabase.from("business_services").delete().eq("business_id", user.id);
    const { error: svcErr } = wanted.length
      ? await supabase.from("business_services").upsert(
          wanted.map((id) => ({ business_id: user.id, service_id: id })),
          { onConflict: "business_id,service_id" }
        )
      : { error: null };

    setBusy(false);
    const err = areaErr ?? svcErr;
    if (err) {
      toast(err.message, "error");
      await load();
      return;
    }
    setDirty(false);
    toast("Saved. Your pin now shows these trades.", "success");
  }

  return (
    <BusinessShell>
      {loading ? (
        <Spinner label="Loading…" />
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">What your company does</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  These decide the icon on your pin, so a customer scanning the map can see
                  what you do before they tap.
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {picked.length} selected
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {cats.map((c) => (
                <Chip
                  key={c.id}
                  active={picked.includes(c.id)}
                  onClick={() => toggle(picked, setPicked, c.id)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name={webIcon(c.icon)} size="sm" />
                    {c.name}
                  </span>
                </Chip>
              ))}
            </div>
            {picked.length === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Nothing selected — your pin shows the general-work icon.
              </p>
            )}
          </Card>

          <Card className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Areas you cover</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Where your technicians travel to — separate from where your premises are.
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {areas.length} selected
              </span>
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
            <Button disabled={busy || !dirty} onClick={save}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
            {!dirty && !busy && (
              <Pill tone="ok" icon="check">
                Up to date
              </Pill>
            )}
          </div>
        </>
      )}
    </BusinessShell>
  );
}
