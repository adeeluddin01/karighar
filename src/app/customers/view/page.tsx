"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Avatar, Card, EmptyState, KV, Pill, Rating, Spinner } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { CustomerReview, Profile, PublicCustomerRating } from "@/lib/types";

/* ============================================================
   A customer, as the pro working for them sees it.

   The provider job view showed a customer's name and rating but nothing to
   click, so a pro deciding whether to accept had no way to read what other
   pros had said about them. Jobs run on cash in someone's home — that
   judgement matters in both directions, and the data was already there:
   `customer_reviews` is world-readable (rev_read is `using (true)`) and
   `public_customer_ratings` carries the running average.

   What is NOT here is the name and phone, unless RLS hands them over.
   `profiles_job_peer` admits only a pro ASSIGNED to one of this customer's
   jobs, so on an open job this page shows the ratings and nothing personal.
   That is the correct behaviour, not a gap to work around.
   ============================================================ */
function CustomerProfileContent() {
  const id = useSearchParams().get("id") ?? "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rating, setRating] = useState<PublicCustomerRating | null>(null);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const [{ data: prof }, { data: rate }, { data: revs }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabase.from("public_customer_ratings").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("customer_reviews")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setProfile(prof as Profile | null);
    setRating(rate as PublicCustomerRating | null);
    setReviews((revs as CustomerReview[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (loading) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  // No profile row is the ordinary case on an open job, not an error — see
  // the note above. Only a missing id is actually wrong.
  if (!id) {
    return (
      <AppShell width="narrow">
        <EmptyState icon="search" title="No customer" hint="This link is missing a customer id." />
      </AppShell>
    );
  }

  const rated = rating && rating.jobs_rated > 0;

  return (
    <AppShell width="narrow">
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={profile?.full_name} src={profile?.avatar_url} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">
              {profile?.full_name ?? "Customer"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {rated ? (
                <>
                  <Rating value={rating.rating_avg} />
                  {rating.rating_avg.toFixed(1)} · {rating.jobs_rated}{" "}
                  {rating.jobs_rated === 1 ? "rating" : "ratings"} from pros
                </>
              ) : (
                "No ratings yet"
              )}
            </p>
          </div>
        </div>

        {!profile && (
          <>
            <div className="sep" />
            <p className="text-sm text-muted-foreground">
              Their name and number are shared with the pro working the job. Take the job to see
              them.
            </p>
          </>
        )}

        {profile?.phone && (
          <>
            <div className="sep" />
            <KV label="Phone">
              <a href={`tel:${profile.phone}`} className="font-semibold text-primary">
                {profile.phone}
              </a>
            </KV>
          </>
        )}
      </Card>

      <div className="mt-8 mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">What pros said</h2>
        <span className="text-xs text-muted-foreground">
          {reviews.length === 20 ? "Showing latest 20" : `${reviews.length} shown`}
        </span>
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          icon="star"
          title="No reviews yet"
          hint="Pros can rate a customer once a job is finished."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between gap-3">
                <Rating value={r.rating} />
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("en-GB")}
                </span>
              </div>
              {r.comment && <p className="mt-2 whitespace-pre-line text-sm">{r.comment}</p>}
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Icon name="shield" size="sm" className="mt-0.5 shrink-0" />
        Ratings come from completed jobs only — a pro can rate a customer once the work is done.
      </p>

      {profile?.created_at && (
        <div className="mt-4">
          <Pill tone="gray">
            Customer since{" "}
            {new Date(profile.created_at).toLocaleDateString("en-GB", {
              month: "long",
              year: "numeric",
            })}
          </Pill>
        </div>
      )}
    </AppShell>
  );
}

export default function CustomerProfilePage() {
  return (
    <Suspense
      fallback={
        <AppShell width="narrow">
          <Spinner label="Loading…" />
        </AppShell>
      }
    >
      <CustomerProfileContent />
    </Suspense>
  );
}
