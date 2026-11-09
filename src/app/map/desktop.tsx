"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Icon, type IconName } from "@/components/Icon";
import { clsx } from "@/lib/clsx";
import { Avatar, Card, LinkButton, PageHeader, Pill, Rating } from "@/components/ui";
import { BusinessesMap } from "@/components/maps/BusinessesMap";
import { businessName, fetchBusinessPins, type BusinessPin } from "@/lib/businesses";
import { CATEGORY_ICON_WEB, CATEGORY_ICON_FALLBACK } from "@/lib/catalogIcons";


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
export default function NearbyCompaniesPage() {
  const [firms, setFirms] = useState<BusinessPin[]>([]);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      // Companies only. Technicians are not fetched here any more — there
      // is no coordinate of theirs to put on this map, and listing them
      // beside one implied otherwise.
      const pins = await fetchBusinessPins(supabase);
      setFirms(pins);
    })();
  }, []);

  return (
    <AppShell>
      {/* Was "Verified pros near you", with the technician grid below it.
          We hold no location for a technician to publish — only a company's
          registered premises, and an assigned pro's live position while they
          are on their way to you. Browsing people moved to Book > Book a
          technician, where it is a list and implies no location. */}
      <PageHeader
        title="Companies near you"
        subtitle="Registered premises in Karachi. To browse individual technicians, use Book a technician."
        action={
          <LinkButton href="/book/?tab=technicians" size="sm" icon="users">
            Book a technician
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
                    <Icon name="chevron" size="sm" className="rtl:-scale-x-100" />
                  </LinkButton>
                </Card>
              </div>
            ))}
          </div>
        </section>
      )}

      <Card className="text-center">
        <p className="text-sm font-semibold">Looking for a specific technician?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse every verified technician by trade and rating, and ask for one by name.
        </p>
        <LinkButton href="/book/?tab=technicians" size="sm" className="mt-4">
          Book a technician
        </LinkButton>
      </Card>
    </AppShell>
  );
}
