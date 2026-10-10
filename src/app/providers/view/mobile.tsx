"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Screen, Scroll, TopBar, Cta } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Ava, EmptyK, Pill, Skel } from "@/components/kg/parts";
import { fetchPublicPros, proName, type PublicPro } from "@/lib/providers";
import { formatPKR } from "@/lib/money";
import type { Service } from "@/lib/types";

type Review = { id: string; rating: number; comment: string | null; created_at: string };

function Stars({ n }: { n: number }) {
  const filled = Math.round(n || 0);
  return (
    <span style={{ display: "inline-flex", gap: 2 }} aria-label={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <KIcon
          key={i}
          name="star"
          xs
          className={i <= filled ? "star" : "kg-star-off"}
        />
      ))}
    </span>
  );
}

function ProviderProfileContent() {
  const id = useSearchParams().get("id") ?? "";
  const [profile, setProfile] = useState<PublicPro | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [from, setFrom] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    (async () => {
      const [found, { data: revs }, { data: services }] = await Promise.all([
        fetchPublicPros(supabase, { id }),
        supabase
          .from("reviews")
          .select("id,rating,comment,created_at")
          .eq("provider_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("services").select("base_price").eq("is_active", true),
      ]);
      setProfile(found.pros[0] ?? null);
      setReviews((revs as Review[]) ?? []);
      const prices = ((services as Pick<Service, "base_price">[]) ?? [])
        .map((s) => s.base_price)
        .filter((p): p is number => p !== null);
      setFrom(prices.length ? Math.min(...prices) : null);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <Screen>
        <TopBar title="Pro" />
        <Scroll underTop pad="plain">
          <Skel h={120} />
          <Skel h={80} />
          <Skel h={140} />
        </Scroll>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <TopBar title="Pro" back="/map" />
        <Scroll underTop pad="plain">
          <EmptyK
            icon="search"
            title="Pro not found"
            hint="This profile may no longer be active."
          >
            <Link className="btn sm" href="/map" style={{ marginTop: 10 }}>
              Browse pros
            </Link>
          </EmptyK>
        </Scroll>
      </Screen>
    );
  }

  const rating = Number(profile.rating_avg);

  return (
    <Screen>
      <TopBar title={proName(profile)} back="/map" />
      <Scroll underTop pad="cta">
        <div className="me card">
          <Ava name={proName(profile)} size="xl" verified />
          <div>
            <b>{proName(profile)}</b>
            <small>
              {profile.service_areas?.length ? profile.service_areas.join(" · ") : "Karachi"}
            </small>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Stars n={rating} />
              <small style={{ display: "inline" }}>
                {rating ? rating.toFixed(1) : "New"} · {profile.jobs_completed} jobs
              </small>
            </span>
          </div>
        </div>

        <div className="badges">
          <Pill tone="ok" icon="shield">
            CNIC verified
          </Pill>
          <Pill icon="check">{profile.jobs_completed} jobs done</Pill>
          {profile.service_areas?.[0] && <Pill icon="pin">{profile.service_areas[0]}</Pill>}
        </div>

        {profile.bio && <p className="desc">{profile.bio}</p>}

        <div className="stats3">
          <div>
            <small>Rating</small>
            <b>{rating ? rating.toFixed(1) : "—"}</b>
          </div>
          <div>
            <small>Jobs done</small>
            <b>{profile.jobs_completed.toLocaleString("en-PK")}</b>
          </div>
          <div>
            <small>Reviews</small>
            <b>{reviews.length}</b>
          </div>
        </div>

        {profile.service_areas?.length > 0 && (
          <>
            <h3 className="lbl">Areas covered</h3>
            <div className="chips wrap">
              {profile.service_areas.map((a) => (
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
            {reviews.length} total
          </span>
        </div>

        {reviews.length === 0 ? (
          <EmptyK icon="star" title="No reviews yet" hint="Reviews appear after completed jobs." />
        ) : (
          <div className="list">
            {reviews.map((r) => (
              <article key={r.id} className="card">
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
            <b>Ratings come from real bookings.</b> Only customers who completed and paid for a job
            can review a pro.
          </p>
        </div>
      </Scroll>

      <Cta>
        <div>
          <small>Visits from</small>
          <b>{from === null ? "On quote" : formatPKR(from)}</b>
        </div>
        <Link className="btn" href="/book">
          Book a service
          <KIcon name="arrow" />
        </Link>
      </Cta>
    </Screen>
  );
}

export default function ProviderProfilePage() {
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
      <ProviderProfileContent />
    </Suspense>
  );
}
