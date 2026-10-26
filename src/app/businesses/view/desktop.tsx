"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Avatar, Card, EmptyState, Pill, Spinner } from "@/components/ui";
import {
  businessName,
  fetchPublicBusiness,
  type BusinessReview,
  type PublicBusiness,
} from "@/lib/businesses";

function Stars({ n }: { n: number }) {
  const filled = Math.round(n || 0);
  return (
    <span className="star" aria-label={`${filled} out of 5 stars`}>
      {"★".repeat(filled)}
      <span className="text-border">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

function BusinessProfileContent() {
  const id = useSearchParams().get("id") ?? "";
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [reviews, setReviews] = useState<BusinessReview[]>([]);
  // `loading` is DERIVED, not set in the effect: an early `setLoading(false)`
  // for a missing id would be a synchronous setState in an effect body
  // (react-hooks/set-state-in-effect). With no id there is nothing to load,
  // so the page goes straight to its not-found state.
  const [loaded, setLoaded] = useState(false);
  const loading = id !== "" && !loaded;

  useEffect(() => {
    if (!id) return;
    void (async () => {
      // Never throws, and reports a database without business accounts the
      // same way as a business that doesn't exist — both land on the
      // not-found state below rather than an error.
      const res = await fetchPublicBusiness(createClient(), id);
      setBusiness(res.business);
      setReviews(res.reviews);
      setLoaded(true);
    })();
  }, [id]);

  if (loading) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading profile…" />
      </AppShell>
    );
  }
  if (!business) {
    return (
      <AppShell width="narrow">
        <EmptyState
          icon="search"
          title="Company not found"
          hint="This profile may no longer be active."
        />
      </AppShell>
    );
  }

  const name = businessName(business);
  const rating = Number(business.rating_avg);

  return (
    <AppShell width="narrow">
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Stars n={rating} />
              {rating ? rating.toFixed(1) : "New"} · {business.jobs_completed}{" "}
              {business.jobs_completed === 1 ? "rating" : "ratings"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill tone="ok" icon="building">
                Karighar company
              </Pill>
              {business.team_size > 0 && (
                <Pill tone="gray" icon="users">
                  {business.team_size} verified{" "}
                  {business.team_size === 1 ? "technician" : "technicians"}
                </Pill>
              )}
            </div>
          </div>
        </div>

        {business.about && (
          <>
            <div className="sep" />
            <p className="text-sm leading-relaxed text-muted-foreground">{business.about}</p>
          </>
        )}

        {business.service_areas?.length > 0 && (
          <>
            <div className="sep" />
            <p className="text-xs font-semibold text-muted-foreground">Areas covered</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {business.service_areas.map((a) => (
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
        <span className="text-xs text-muted-foreground">{reviews.length} shown</span>
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          icon="star"
          title="No reviews yet"
          hint="Reviews appear after this company's technicians complete jobs."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((r) => (
            <Card key={r.review_key}>
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

      <Card className="mt-6">
        <p className="text-xs text-muted-foreground">
          Every technician this company sends is verified by Karighar individually — the same
          CNIC check as an independent pro. Ratings come from real bookings: only a customer who
          completed and paid for a job can leave one.
        </p>
      </Card>
    </AppShell>
  );
}

export default function BusinessProfilePage() {
  return (
    <Suspense
      fallback={
        <AppShell width="narrow">
          <Spinner />
        </AppShell>
      }
    >
      <BusinessProfileContent />
    </Suspense>
  );
}
