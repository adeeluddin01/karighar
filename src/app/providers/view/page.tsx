"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Avatar, Card, EmptyState, Pill, Spinner } from "@/components/ui";

type PublicProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  rating_avg: number;
  jobs_completed: number;
  service_areas: string[];
};
type Review = { id: string; rating: number; comment: string | null; created_at: string };

function Stars({ n }: { n: number }) {
  const filled = Math.round(n || 0);
  return (
    <span className="star" aria-label={`${filled} out of 5 stars`}>
      {"★".repeat(filled)}
      <span className="text-border">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

function ProviderProfileContent() {
  const id = useSearchParams().get("id") ?? "";
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    (async () => {
      const [{ data: prof }, { data: revs }] = await Promise.all([
        supabase.from("public_provider_profiles").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("reviews")
          .select("id,rating,comment,created_at")
          .eq("provider_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setProfile(prof as PublicProfile | null);
      setReviews((revs as Review[]) || []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading profile…" />
      </AppShell>
    );
  }
  if (!profile) {
    return (
      <AppShell width="narrow">
        <EmptyState icon="search" title="Provider not found" hint="This profile may no longer be active." />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={profile.full_name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">
              {profile.full_name ?? "Provider"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Stars n={profile.rating_avg} />
              {profile.rating_avg ? profile.rating_avg.toFixed(1) : "New"} ·{" "}
              {profile.jobs_completed} jobs
            </p>
            <Pill tone="ok" icon="shield" className="mt-2">
              Verified
            </Pill>
          </div>
        </div>

        {profile.bio && (
          <>
            <div className="sep" />
            <p className="text-sm leading-relaxed text-muted-foreground">{profile.bio}</p>
          </>
        )}

        {profile.service_areas?.length > 0 && (
          <>
            <div className="sep" />
            <p className="text-xs font-semibold text-muted-foreground">Areas covered</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.service_areas.map((a) => (
                <Pill key={a} tone="gray">
                  {a}
                </Pill>
              ))}
            </div>
          </>
        )}
      </Card>

      <div className="mt-8 mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Reviews</h2>
        <span className="text-xs text-muted-foreground">{reviews.length} total</span>
      </div>

      {reviews.length === 0 ? (
        <EmptyState icon="star" title="No reviews yet" hint="Reviews appear after completed jobs." />
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between">
                <Stars n={r.rating} />
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("en-PK")}
                </span>
              </div>
              {r.comment && <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export default function ProviderProfilePage() {
  return (
    <Suspense
      fallback={
        <AppShell width="narrow">
          <Spinner />
        </AppShell>
      }
    >
      <ProviderProfileContent />
    </Suspense>
  );
}
