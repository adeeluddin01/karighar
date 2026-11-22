"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPKR } from "@/lib/catalog";
import { fallbackHomeCats, homeCatsFromDb, limitHomeCats, type HomeCat } from "@/lib/homeCatalog";
import { createClient } from "@/lib/supabase/client";
import { useIsPhone } from "@/components/Lanes";
import { AppShell } from "@/components/AppShell";
import { BecomeProCard } from "@/components/BecomeProCard";
import { HeroSearch } from "@/components/HeroSearch";
import { Shot } from "@/components/Shot";
import { Icon, type IconName } from "@/components/Icon";
import { Card, LinkButton } from "@/components/ui";
import { BRAND } from "@/lib/config";
import type { Service, ServiceCategory } from "@/lib/types";

const HOW_IT_WORKS = [
  ["1", "Pick a service", "Choose a fixed-price service or post a custom job for quotes."],
  ["2", "Get matched", "A verified pro near you accepts — or bids on your custom job."],
  ["3", "Track live", "Follow your pro on the map from on-the-way to arrived."],
  ["4", "Pay & rate", "Pay cash on completion, then rate your pro."],
] as const;

const GUARANTEE: [IconName, string, string][] = [
  ["idcard", "CNIC-verified pros", "Every pro passes identity and background checks."],
  ["creditcard", "Pay after the job", "No advance payment. Cash on completion."],
  ["tag", "Upfront pricing", "You see the price before you book — no surprises."],
  ["shield", "Satisfaction guarantee", "Not fixed properly? Tell us and we make it right."],
];

// The cheapest listed service in a category, for the "From Rs …" line on the
// service cards. Returns the SERVICE, not just the number, so the unit can
// travel with it — a category whose floor is "Rs 65 / sq ft" must not read
// as a flat "From Rs 65". Mirrors `cheapest()` on the phone lane.
function cheapest<T extends { basePrice: number | null }>(services: T[]): T | null {
  let best: T | null = null;
  for (const s of services) {
    if (s.basePrice === null) continue;
    if (best === null || s.basePrice < (best.basePrice as number)) best = s;
  }
  return best;
}

export default function Home() {
  // The live catalog, with the hardcoded CATALOG as the initial state —
  // not a spinner. That keeps the first paint and the prerendered static
  // HTML carrying real names and prices (see LaneSplit), and the page
  // never goes empty or errors when the database is unreachable: the
  // fallback simply stays. Once hydrated on the web lane, the same
  // public queries /book runs replace it with every live category and
  // its photo, so a photo an admin uploads shows here without a redeploy.
  // Gated to the web lane like the phone lane gates its own fetch, so the
  // two mounted lanes don't both fetch on a phone.
  const isPhone = useIsPhone();
  const [cats, setCats] = useState<HomeCat[]>(() => fallbackHomeCats());

  // The Home shows the first three live categories only, in sort_order.
  const shown = limitHomeCats(cats);

  useEffect(() => {
    if (isPhone !== false) return;
    const supabase = createClient();
    (async () => {
      const [{ data: categories, error: e1 }, { data: services, error: e2 }] = await Promise.all([
        supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("services").select("*").eq("is_active", true),
      ]);
      if (e1 || e2) return; // Keep the fallback; the Home must not error.
      const live = homeCatsFromDb(
        (categories as ServiceCategory[]) ?? [],
        (services as Service[]) ?? []
      );
      if (live.length > 0) setCats(live);
    })();
  }, [isPhone]);

  return (
    <AppShell>
      {/* Hero */}
      <section className="hero">
        <p className="text-sm font-semibold opacity-85">Salaam 👋 {BRAND.city}</p>
        <h1 className="relative z-[1] mt-1 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
          What do you need
          <br />
          help with?
        </h1>
        <p className="relative z-[1] mt-2 text-sm opacity-85">
          CNIC-verified technicians at your door, with fixed prices and live tracking.
        </p>
        <HeroSearch />
      </section>

      {/* Services */}
      <div className="mt-10 mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Our services</h2>
        <span className="text-xs text-muted-foreground">{shown.length} available</span>
      </div>
      {/* The same image-first card as /book: the category's photo, falling
          back to its first service's photo, with the icon <Shot> draws
          underneath while the photo loads or when there is no art at all. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((cat) => {
          const from = cheapest(cat.services);
          return (
            <Link
              key={cat.key}
              href="/book"
              className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lift"
            >
              <Shot src={cat.imageUrl} icon={cat.icon} />
              <span className="flex flex-1 flex-col p-3">
                <span className="line-clamp-2 text-base font-bold">{cat.name}</span>
                <span className="mt-auto pt-1.5 text-base font-extrabold">
                  {from === null ? (
                    "On quote"
                  ) : (
                    <>
                      From {formatPKR(from.basePrice)}
                      <span className="ms-1 text-xs font-semibold text-muted-foreground">
                        /{from.unit}
                      </span>
                    </>
                  )}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      {/* How it works */}
      <h2 className="mt-12 mb-4 text-xl font-bold tracking-tight">How it works</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_IT_WORKS.map(([n, title, desc]) => (
          <Card key={n}>
            <span className="avatar">{n}</span>
            <p className="mt-3 text-base font-bold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </Card>
        ))}
      </div>

      {/* Guarantee */}
      <Card className="mt-6">
        <div className="flex items-center gap-4">
          <span className="emoji">
            <Icon name="shield" size="lg" className="text-accent-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold">The {BRAND.name} Guarantee</p>
            <p className="text-sm text-muted-foreground">
              Verified pros, upfront prices, and you only pay once the work is done.
            </p>
          </div>
        </div>
        <div className="sep" />
        <div className="grid gap-4 sm:grid-cols-2">
          {GUARANTEE.map(([icon, title, desc]) => (
            <div key={title} className="flex items-start gap-3">
              <span className="emoji">
                <Icon name={icon} className="text-accent-foreground" />
              </span>
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Prices */}
      <div className="mt-12 mb-4">
        <h2 className="text-xl font-bold tracking-tight">Services &amp; prices</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Transparent {BRAND.city} rates. You see the price before you book.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {shown.map((cat) => (
          <Card key={cat.key} className="flex flex-col">
            <div className="flex items-center gap-3">
              <span className="emoji">
                <Icon name={cat.icon} className="text-accent-foreground" />
              </span>
              <h3 className="text-base font-bold">{cat.name}</h3>
            </div>
            <div className="sep" />
            <div className="flex-1">
              {cat.services.map((s) => (
                <div key={s.name} className="kv items-start">
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.description}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    {formatPKR(s.basePrice)}
                    <span className="block text-xs font-normal text-muted-foreground">
                      / {s.unit}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <LinkButton href="/book" variant="ghost" size="sm" className="mt-4 w-full">
              Book {cat.name}
              <Icon name="chevron" size="sm" className="rtl:-scale-x-100" />
            </LinkButton>
          </Card>
        ))}
      </div>

      {/* Pro / business — the supply side of the marketplace. */}
      <BecomeProCard />

      {/* Footer */}
      <footer className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <span className="font-extrabold text-primary">{BRAND.name}</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/pro" className="hover:text-foreground">
              Become a Pro
            </Link>
          </nav>
          <span className="text-xs">
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.city}, Pakistan
          </span>
        </div>
      </footer>
    </AppShell>
  );
}
