"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TechnicianBrowse } from "@/components/TechnicianBrowse";
import { AppShell } from "@/components/AppShell";
import { Shot } from "@/components/Shot";
import { Icon, type IconName } from "@/components/Icon";
import { CATEGORY_ICON_WEB } from "@/lib/catalogIcons";
import {
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Spinner,
  Tabs,
  formatPKR,
} from "@/components/ui";
import type { Service, ServiceCategory } from "@/lib/types";

type CatalogCat = ServiceCategory & { services: Service[] };

// Slug -> icon lives in lib/catalogIcons.ts alongside the phone lane's map
// and the list /admin/catalog offers, so the three cannot drift apart.
const CATEGORY_ICON = CATEGORY_ICON_WEB as Record<string, IconName>;

function BookInner() {
  const search = useSearchParams();
  const initialQuery = search.get("q") ?? "";
  const [cats, setCats] = useState<CatalogCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  // The web twin of the phone lane's toggle. Same ?tab=technicians param, so
  // one link works whichever lane the visitor lands in.
  const [tab, setTab] = useState<"services" | "technicians">(
    search.get("tab") === "technicians" ? "technicians" : "services"
  );
  // The named technician, carried onto every onward link. See the phone lane.
  const pro = search.get("pro");
  const withPro = (href: string) =>
    pro ? `${href}${href.includes("?") ? "&" : "?"}pro=${pro}` : href;
  const [proName, setProName] = useState<string | null>(null);
  const [proServices, setProServices] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!pro) return;
    const supabase = createClient();
    void (async () => {
      const [{ data: rows }, { data: profRow }] = await Promise.all([
        supabase.from("public_provider_services").select("service_id").eq("provider_id", pro),
        supabase.from("public_provider_profiles").select("full_name").eq("id", pro).maybeSingle(),
      ]);
      setProServices(
        rows ? new Set((rows as { service_id: string }[]).map((r) => r.service_id)) : null
      );
      setProName((profRow as { full_name: string | null } | null)?.full_name ?? null);
    })();
  }, [pro]);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [{ data: categories, error: e1 }, { data: services, error: e2 }] = await Promise.all([
        supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("services").select("*").eq("is_active", true),
      ]);
      if (e1 || e2) {
        setError(e1?.message || e2?.message || "Failed to load services");
        setLoading(false);
        return;
      }
      const grouped = (categories as ServiceCategory[]).map((c) => ({
        ...c,
        services: (services as Service[]).filter((s) => s.category_id === c.id),
      }));
      setCats(grouped);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cats;
    return cats
      .map((c) => ({
        ...c,
        services: c.services.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.description ?? "").toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
        ),
      }))
      .map((c) => ({
        ...c,
        services: proServices ? c.services.filter((s) => proServices.has(s.id)) : c.services,
      }))
      .filter((c) => c.services.length > 0);
  }, [cats, query, proServices]);

  const count = filtered.reduce((n, c) => n + c.services.length, 0);

  return (
    <AppShell>
      <PageHeader
        title="What do you need help with?"
        subtitle="Pick a service in Karachi — prices are upfront."
        action={
          <LinkButton href={withPro("/book/custom")} variant="ghost" size="sm" icon="plus">
            Post a custom job
          </LinkButton>
        }
      />

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "services", label: "Book a service" },
            { key: "technicians", label: "Book a technician" },
          ]}
        />
      </div>

      {pro && tab === "services" && (
        <Card className="mb-4 bg-primary-light">
          <p className="text-sm">
            <strong>Booking {proName ?? "this technician"}.</strong> Showing only the services they
            offer.{" "}
            <Link href="/book" className="font-semibold text-primary underline">
              Browse everything instead
            </Link>
          </p>
        </Card>
      )}

      {tab === "technicians" ? (
        <TechnicianBrowse categories={cats} />
      ) : (
      <>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search services — e.g. AC, wiring, leak…"
        aria-label="Search services"
        prefix={<Icon name="search" className="text-muted-foreground" />}
      />

      {loading && <Spinner label="Loading services…" />}

      {error && (
        <Card className="mt-6 border-destructive">
          <p className="font-semibold text-destructive">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Make sure you ran <code>supabase/schema.sql</code> and set your keys in{" "}
            <code>.env.local</code>.
          </p>
        </Card>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon="search"
            title="No matches"
            hint={
              query
                ? `Nothing matches “${query}”. Try another word, or post a custom job.`
                : "No services are published yet."
            }
          >
            <LinkButton href={withPro("/book/custom")} size="sm">
              Post a custom job
            </LinkButton>
          </EmptyState>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div className="mt-8 mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Services</h2>
            <span className="text-xs text-muted-foreground">{count} available</span>
          </div>

          <div className="space-y-8">
            {filtered.map((cat) => (
              <section key={cat.id}>
                <div className="flex items-center gap-3">
                  <span className="emoji">
                    <Icon name={CATEGORY_ICON[cat.icon ?? ""] ?? "wrench"} className="text-accent-foreground" />
                  </span>
                  <h3 className="text-base font-bold">{cat.name}</h3>
                </div>
                {/* Image-first cards, the same shape the phone lane draws.
                    Not `.opt`: that class is a padded column used by four
                    other web screens and fights an edge-to-edge photo. */}
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {cat.services.map((s) => (
                    <Link
                      key={s.id}
                      href={withPro(`/book/service/?id=${s.id}`)}
                      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lift"
                    >
                      <Shot
                        src={s.image_url ?? cat.image_url}
                        icon={CATEGORY_ICON[cat.icon ?? ""] ?? "wrench"}
                      />
                      <span className="flex flex-1 flex-col p-3">
                        <span className="line-clamp-2 text-base font-bold">{s.name}</span>
                        {/* The unit travels with the price: a service priced
                            per sq ft must not read as a flat "Rs 65". */}
                        <span className="mt-auto pt-1.5 text-base font-extrabold">
                          {formatPKR(s.base_price)}
                          {s.base_price !== null && (
                            <span className="ms-1 text-xs font-semibold text-muted-foreground">
                              /{s.unit}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      </>
      )}
    </AppShell>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <Spinner label="Loading services…" />
        </AppShell>
      }
    >
      <BookInner />
    </Suspense>
  );
}
