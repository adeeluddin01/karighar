"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Icon, type IconName } from "@/components/Icon";
import { clsx } from "@/lib/clsx";
import { Avatar, Card, EmptyState, LinkButton, PageHeader, Pill, Rating, Spinner } from "@/components/ui";
import { BusinessesMap } from "@/components/maps/BusinessesMap";
import { businessName, fetchBusinessPins, type BusinessPin } from "@/lib/businesses";
import { CATEGORY_ICON_WEB, CATEGORY_ICON_FALLBACK } from "@/lib/catalogIcons";

type PublicPro = {
  id: string;
  full_name: string | null;
  bio: string | null;
  rating_avg: number;
  jobs_completed: number;
  service_areas: string[];
};

const webIcon = (slug: string | null) =>
  (CATEGORY_ICON_WEB[slug ?? ""] ?? CATEGORY_ICON_FALLBACK) as IconName;

/**
 * Desktop lane of /map.
 *
 * Individual technicians have no stored coordinates — they have
 * `service_areas`, a list of neighbourhood names — so they are listed, not
 * plotted. Service companies are different: a business is a licensed
 * premises whose pin the admin records at grant time (patch_v22), so those
 * do go on a map, carrying the icon of the trade they cover. A deployment
 * with no business accounts sees the page exactly as it was.
 */
export default function NearbyProsPage() {
  const [pros, setPros] = useState<PublicPro[] | null>(null);
  const [firms, setFirms] = useState<BusinessPin[]>([]);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const [{ data }, pins] = await Promise.all([
        supabase
          .from("public_provider_profiles")
          .select("id,full_name,bio,rating_avg,jobs_completed,service_areas")
          .order("rating_avg", { ascending: false })
          .order("jobs_completed", { ascending: false }),
        fetchBusinessPins(supabase),
      ]);
      setPros((data as PublicPro[]) ?? []);
      setFirms(pins);
    })();
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="Verified pros near you"
        subtitle="Every pro below has passed CNIC and background checks."
        action={
          <LinkButton href="/book" size="sm" icon="plus">
            Book a service
          </LinkButton>
        }
      />

      {firms.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-bold tracking-tight">Service companies</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Companies work from a fixed address, so you can see exactly where they are. Each
            pin carries the trade it covers.
          </p>
          <BusinessesMap firms={firms} selected={focus} onSelect={setFocus} />
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {firms.map((f) => (
              // Hovering a card lights its pin, which is the only way to
              // tell which of several nearby pins belongs to which company.
              <div
                key={f.id}
                onMouseEnter={() => setFocus(f.id)}
                onMouseLeave={() => setFocus(null)}
              >
                <Card className={clsx("flex h-full flex-col", focus === f.id && "ring-2 ring-primary")}>
                  <div className="flex items-center gap-3">
                    <Avatar name={f.full_name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/businesses/view/?id=${f.id}`}
                        className="block truncate text-base font-bold hover:text-primary"
                      >
                        {businessName(f)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        <Rating value={Number(f.rating_avg)} /> · {f.team_size} on the team
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-1 flex-wrap gap-2">
                    {f.trades.length === 0 ? (
                      <Pill tone="gray">General work</Pill>
                    ) : (
                      f.trades.map((t) => (
                        <Pill key={t.id} tone="gray" icon={webIcon(t.icon)}>
                          {t.name}
                        </Pill>
                      ))
                    )}
                  </div>

                  <LinkButton
                    href={`/businesses/view/?id=${f.id}`}
                    variant="ghost"
                    size="sm"
                    className="mt-4 w-full"
                  >
                    View company
                    <Icon name="chevron" size="sm" />
                  </LinkButton>
                </Card>
              </div>
            ))}
          </div>
        </section>
      )}

      {firms.length > 0 && (
        <h2 className="mb-4 text-lg font-bold tracking-tight">Independent pros</h2>
      )}

      {pros === null ? (
        <Spinner label="Loading pros…" />
      ) : pros.length === 0 ? (
        <EmptyState
          icon="users"
          title="No verified pros yet"
          hint="Pros appear here once their verification is approved. You can still book — we'll match you as soon as one is available."
        >
          <LinkButton href="/book" size="sm">
            Book a service
          </LinkButton>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pros.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <div className="flex items-center gap-3">
                <Avatar name={p.full_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/providers/view/?id=${p.id}`}
                    className="block truncate text-base font-bold hover:text-primary"
                  >
                    {p.full_name ?? "Pro"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    <Rating value={Number(p.rating_avg)} /> · {p.jobs_completed} jobs
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Pill tone="ok" icon="shield">
                  CNIC verified
                </Pill>
                {p.service_areas?.slice(0, 2).map((a) => (
                  <Pill key={a} tone="gray">
                    {a}
                  </Pill>
                ))}
              </div>

              {p.bio && (
                <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">{p.bio}</p>
              )}

              <LinkButton
                href={`/providers/view/?id=${p.id}`}
                variant="ghost"
                size="sm"
                className="mt-4 w-full"
              >
                View profile
                <Icon name="chevron" size="sm" />
              </LinkButton>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
