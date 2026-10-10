"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Avatar, Card, EmptyState, LinkButton, PageHeader, Pill, Rating, Spinner } from "@/components/ui";

type PublicPro = {
  id: string;
  full_name: string | null;
  bio: string | null;
  rating_avg: number;
  jobs_completed: number;
  service_areas: string[];
};

// Desktop lane of /map. Providers have no stored coordinates, so there is
// nothing to plot — the web layout lists the verified pros instead, while the
// phone lane keeps the redesign's map-and-sheet screen.
export default function NearbyProsPage() {
  const [pros, setPros] = useState<PublicPro[] | null>(null);

  useEffect(() => {
    createClient()
      .from("public_provider_profiles")
      .select("id,full_name,bio,rating_avg,jobs_completed,service_areas")
      .order("rating_avg", { ascending: false })
      .order("jobs_completed", { ascending: false })
      .then(({ data }) => setPros((data as PublicPro[]) ?? []));
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
