"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Screen, Scroll, TopBar, Cta } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Ava, EmptyK, Pill, Skel } from "@/components/kg/parts";
import {
  businessName,
  fetchPublicBusiness,
  type BusinessReview,
  type PublicBusiness,
} from "@/lib/businesses";

function Stars({ n }: { n: number }) {
  const filled = Math.round(n || 0);
  return (
    <span style={{ display: "inline-flex", gap: 2 }} aria-label={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <KIcon key={i} name="star" xs className={i <= filled ? "star" : "kg-star-off"} />
      ))}
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
      const res = await fetchPublicBusiness(createClient(), id);
      setBusiness(res.business);
      setReviews(res.reviews);
      setLoaded(true);
    })();
  }, [id]);

  if (loading) {
    return (
      <Screen>
        <TopBar title="Company" />
        <Scroll underTop pad="plain">
          <Skel h={120} />
          <Skel h={80} />
          <Skel h={140} />
        </Scroll>
      </Screen>
    );
  }

  if (!business) {
    return (
      <Screen>
        <TopBar title="Company" back="/bookings" />
        <Scroll underTop pad="plain">
          <EmptyK
            icon="search"
            title="Company not found"
            hint="This profile may no longer be active."
          >
            <Link className="btn sm" href="/bookings" style={{ marginTop: 10 }}>
              Your bookings
            </Link>
          </EmptyK>
        </Scroll>
      </Screen>
    );
  }

  const name = businessName(business);
  const rating = Number(business.rating_avg);

  return (
    <Screen>
      <TopBar title={name} back="/bookings" />
      <Scroll underTop pad="cta">
        <div className="me card">
          <Ava name={name} size="xl" verified />
          <div>
            <b>{name}</b>
            <small>
              {business.service_areas?.length ? business.service_areas.join(" · ") : "Karachi"}
            </small>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Stars n={rating} />
              <small style={{ display: "inline" }}>
                {rating ? rating.toFixed(1) : "New"} · {business.jobs_completed}{" "}
                {business.jobs_completed === 1 ? "rating" : "ratings"}
              </small>
            </span>
          </div>
        </div>

        <div className="badges">
          {/* The kg sprite has no building glyph; briefcase is the one it
              uses for work/company throughout the phone lane. */}
          <Pill tone="ok" icon="briefcase">
            Karighar company
          </Pill>
          {business.team_size > 0 && (
            <Pill icon="users">
              {business.team_size} {business.team_size === 1 ? "technician" : "technicians"}
            </Pill>
          )}
          {business.service_areas?.[0] && <Pill icon="pin">{business.service_areas[0]}</Pill>}
        </div>

        {business.about && <p className="desc">{business.about}</p>}

        <div className="stats3">
          <div>
            <small>Rating</small>
            <b>{rating ? rating.toFixed(1) : "—"}</b>
          </div>
          <div>
            <small>Ratings</small>
            <b>{business.jobs_completed.toLocaleString("en-PK")}</b>
          </div>
          <div>
            <small>Team</small>
            <b>{business.team_size}</b>
          </div>
        </div>

        {business.service_areas?.length > 0 && (
          <>
            <h3 className="lbl">Areas covered</h3>
            <div className="chips wrap">
              {business.service_areas.map((a) => (
                <span key={a} className="chip">
                  {a}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="sec">
          <h3>Reviews</h3>
          <span style={{ fontWeight: 700, fontSize: 12, color: "var(--mute)" }}>
            {reviews.length} shown
          </span>
        </div>

        {reviews.length === 0 ? (
          <EmptyK
            icon="star"
            title="No reviews yet"
            hint="Reviews appear after this company's technicians complete jobs."
          />
        ) : (
          <div className="list">
            {reviews.map((r) => (
              <article key={r.review_key} className="card">
                <div className="bk-top">
                  <Stars n={r.rating} />
                  <small>{new Date(r.created_at).toLocaleDateString("en-PK")}</small>
                </div>
                {r.comment && (
                  <small style={{ marginTop: 6, color: "var(--ink-2)", whiteSpace: "pre-line" }}>
                    {r.comment}
                  </small>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="note">
          <KIcon name="shield" />
          <p>
            <b>Every technician is verified individually.</b> A company never vouches for its own
            people — Karighar runs the same CNIC check as for an independent pro, and only a
            customer who completed and paid for a job can leave a review.
          </p>
        </div>
      </Scroll>

      <Cta>
        <div>
          <small>Verified team</small>
          <b>
            {business.team_size} {business.team_size === 1 ? "technician" : "technicians"}
          </b>
        </div>
        <Link className="btn" href="/book">
          Book a service
          <KIcon name="arrow" />
        </Link>
      </Cta>
    </Screen>
  );
}

export default function BusinessProfilePage() {
  return (
    <Suspense
      fallback={
        <Screen>
          <Scroll pad="plain">
            <Skel h={120} />
            <Skel h={140} />
          </Scroll>
        </Screen>
      }
    >
      <BusinessProfileContent />
    </Suspense>
  );
}
