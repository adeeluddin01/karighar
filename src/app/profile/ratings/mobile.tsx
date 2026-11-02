"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { roleOf } from "@/components/nav";
import { Screen, Scroll, Tabs, TopBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Ava, EmptyK, Skel, Spin } from "@/components/kg/parts";
import {
  fetchAdminRatingPage,
  fetchMyRatingPage,
  RATINGS_PAGE_SIZE,
  type RatingEntry,
  type RatingPage,
  type RatingTab,
} from "@/lib/ratings";

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

export default function RatingsScreen() {
  const { user, profile, providerStatus, businessStatus, loading } =
    useRequireAuth("/profile/ratings");
  const [tab, setTab] = useState<RatingTab>("received");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<RatingPage | null>(null);
  const [fetching, setFetching] = useState(true);

  const effectiveRole = roleOf(!!user, profile?.role, providerStatus, businessStatus);
  const isAdmin = effectiveRole === "admin";
  const isBusiness = effectiveRole === "business";
  const tabs: { id: RatingTab; label: string }[] = isAdmin
    ? [
        { id: "to_provider", label: "Reviews of pros" },
        { id: "to_customer", label: "Reviews of customers" },
      ]
    : isBusiness
      ? [{ id: "received", label: "Received" }]
      : [
          { id: "received", label: "Received" },
          { id: "given", label: "Given" },
        ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const promise =
      effectiveRole === "admin"
        ? fetchAdminRatingPage(
            supabase,
            activeTab === "to_customer" ? "to_customer" : "to_provider",
            page
          )
        : fetchMyRatingPage(
            supabase,
            user.id,
            effectiveRole === "provider"
              ? "provider"
              : effectiveRole === "business"
                ? "business"
                : "customer",
            activeTab === "given" ? "given" : "received",
            page
          );
    promise.then((res) => {
      setData(res);
      setFetching(false);
    });
  }, [user, effectiveRole, activeTab, page]);

  if (loading || !user) {
    return (
      <Screen>
        <TopBar title="Ratings" back="/profile" />
        <Scroll underTop pad="plain">
          <Skel h={120} />
          <Skel h={80} />
        </Scroll>
      </Screen>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / RATINGS_PAGE_SIZE)) : 1;
  const title = isAdmin ? "All reviews" : "My ratings";

  return (
    <Screen>
      <TopBar title={title} back="/profile" />
      <Scroll underTop>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn sm"
              aria-pressed={activeTab === t.id}
              style={activeTab === t.id ? undefined : { opacity: 0.55 }}
              onClick={() => {
                setTab(t.id);
                setPage(0);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {data && (
          <p style={{ marginBottom: 12 }}>
            <small>
              {data.total} {data.total === 1 ? "review" : "reviews"}
              {data.avg !== null ? ` · ${data.avg.toFixed(1)} average` : ""}
            </small>
          </p>
        )}

        {fetching || !data ? (
          <Spin label="Loading ratings…" />
        ) : data.entries.length === 0 ? (
          <EmptyK
            icon="star"
            title="No reviews yet"
            hint={
              isAdmin
                ? "Reviews appear after completed jobs are rated."
                : activeTab === "received"
                  ? "Reviews appear after completed jobs."
                  : "Reviews you leave appear here."
            }
          />
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.entries.map((r: RatingEntry) => (
                <article key={r.id} className="card">
                  <div style={{ display: "flex", gap: 12 }}>
                    <Ava name={r.peer_name ?? r.peer_fallback} src={r.peer_avatar} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b>
                        {isAdmin ? (
                          <>
                            {r.author_name ?? r.author_fallback} rated{" "}
                            {r.peer_name ?? r.peer_fallback}
                            {r.business_name ? ` · via ${r.business_name}` : ""}
                          </>
                        ) : activeTab === "received" ? (
                          (r.peer_name ?? r.peer_fallback)
                        ) : (
                          <>You rated {r.peer_name ?? r.peer_fallback}</>
                        )}
                      </b>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <Stars n={r.rating} />
                        <small>
                          {r.rating} / 5 · {new Date(r.created_at).toLocaleDateString("en-PK")}
                        </small>
                      </div>
                      {r.job_title && <small>{r.job_title}</small>}
                      {r.comment && <p style={{ marginTop: 8 }}>{r.comment}</p>}
                      {!isAdmin && !isBusiness && (
                        <p style={{ marginTop: 8 }}>
                          <Link
                            href={
                              effectiveRole === "provider"
                                ? `/pro/jobs/view/?id=${r.job_id}`
                                : `/bookings/view/?id=${r.job_id}`
                            }
                          >
                            <small>View booking</small>
                          </Link>
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="btn sm"
                disabled={page === 0}
                onClick={() => { setFetching(true); setPage((p) => Math.max(0, p - 1)); }}
              >
                Previous
              </button>
              <small>
                Page {page + 1} of {totalPages}
              </small>
              <button
                type="button"
                className="btn sm"
                disabled={page + 1 >= totalPages}
                onClick={() => { setFetching(true); setPage((p) => p + 1); }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Scroll>
      <Tabs />
    </Screen>
  );
}
