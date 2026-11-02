"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { roleOf } from "@/components/nav";
import { AppShell } from "@/components/AppShell";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Rating,
  Spinner,
} from "@/components/ui";
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
    <span className="star" aria-label={`${filled} out of 5 stars`}>
      {"★".repeat(filled)}
      <span className="text-border">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

function dateOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK");
}

export default function RatingsPage() {
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
  // A business has no "given" tab and an admin has no received/given tabs:
  // if the role resolves after auth, snap the tab to one that exists.
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
      <AppShell width="narrow">
        <Spinner label="Loading ratings…" />
      </AppShell>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / RATINGS_PAGE_SIZE)) : 1;
  const title = isAdmin ? "All reviews" : "My ratings";
  const subtitle = isAdmin
    ? "Every review on the platform, newest first. Names are shown here because this is the moderation view — public pages stay anonymous."
    : isBusiness
      ? "Reviews left by customers on jobs your team dispatched. Business level only — no per-technician breakdown."
      : activeTab === "received"
        ? "Reviews other people left about you — who, what they said, and for which job."
        : "Reviews you left about other people.";

  return (
    <AppShell width="narrow">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={activeTab === t.id ? "primary" : "ghost"}
            size="sm"
            onClick={() => {
              setTab(t.id);
              setPage(0);
              setFetching(true);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {data && (
        <Card className="mt-4">
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? "review" : "reviews"}
            {data.avg !== null && (
              <>
                {" · "}
                <Rating value={data.avg} /> average
              </>
            )}
          </p>
        </Card>
      )}

      {fetching || !data ? (
        <Spinner label="Loading ratings…" />
      ) : data.entries.length === 0 ? (
        <EmptyState
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
          <div className="mt-4 flex flex-col gap-3">
            {data.entries.map((r: RatingEntry) => (
              <Card key={r.id}>
                <div className="flex items-start gap-3">
                  <Avatar
                    name={r.peer_name ?? r.peer_fallback}
                    src={r.peer_avatar}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {isAdmin ? (
                          <>
                            {r.author_name ?? r.author_fallback} rated{" "}
                            {r.peer_name ?? r.peer_fallback}
                            {r.business_name ? ` · via ${r.business_name}` : ""}
                          </>
                        ) : activeTab === "received" ? (
                          r.peer_name ?? r.peer_fallback
                        ) : (
                          <>You rated {r.peer_name ?? r.peer_fallback}</>
                        )}
                      </p>
                      <span className="text-xs text-muted-foreground">{dateOf(r.created_at)}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Stars n={r.rating} />
                      {r.rating} / 5
                      {r.job_title ? ` · ${r.job_title}` : ""}
                    </p>
                    {r.comment && (
                      <p className="mt-2 text-sm leading-relaxed">{r.comment}</p>
                    )}
                    {!isAdmin && !isBusiness && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <Link
                          href={
                            effectiveRole === "provider"
                              ? `/pro/jobs/view/?id=${r.job_id}`
                              : `/bookings/view/?id=${r.job_id}`
                          }
                          className="underline"
                        >
                          View booking
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => { setFetching(true); setPage((p) => Math.max(0, p - 1)); }}
            >
              Previous
            </Button>
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => { setFetching(true); setPage((p) => p + 1); }}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}
