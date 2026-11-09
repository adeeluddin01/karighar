"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Card, Chip, EmptyState, Input, Pill, Rating, Spinner } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { KIcon } from "@/components/kg/icons";
import { Ava, EmptyK, Rate, Skel } from "@/components/kg/parts";
import { clsx } from "@/lib/clsx";
import { InfoTip } from "@/components/InfoTip";
import { proName } from "@/lib/providers";
import {
  fetchTechnicians,
  filterTechnicians,
  matchesTechnician,
  type Technician,
} from "@/lib/technicians";
import type { ServiceCategory } from "@/lib/types";

/* ============================================================
   Browse technicians instead of services.

   The Book tab has always asked "what do you need?" and then found whoever
   was free. This is the other way round — "who do you want?" — for the
   customer who has had someone good before, or who read a profile and
   wants that person.

   Picking one does NOT assign them. It books an ordinary job carrying
   `requested_provider_id`, which patch_v31 holds for that technician for
   ten minutes before releasing it to the normal pool. They still have to
   accept. A customer promised a specific person who then never turns up is
   worse than one who waited ten minutes and got somebody else.

   Both lanes render this; the phone and web Book screens differ in chrome,
   not in what a technician row is.
   ============================================================ */
export function TechnicianBrowse({
  categories,
  /** Phone lane uses the compact row; web gets the roomier card. */
  compact = false,
}: {
  categories: ServiceCategory[];
  compact?: boolean;
}) {
  const [list, setList] = useState<Technician[] | null>(null);
  const [tradesUnavailable, setTradesUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await fetchTechnicians(createClient());
    setList(res.technicians);
    setTradesUnavailable(res.tradesUnavailable);
    setError(res.error);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const shown = useMemo(() => {
    if (!list) return [];
    return filterTechnicians(list, cat).filter((t) => matchesTechnician(t, query));
  }, [list, cat, query]);

  // Only offer a trade filter for trades somebody actually covers — a chip
  // that always returns nothing reads as a broken screen.
  const offered = useMemo(() => {
    if (!list) return [];
    const have = new Set(list.flatMap((t) => t.categoryIds));
    return categories.filter((c) => have.has(c.id));
  }, [list, categories]);

  if (list === null) {
    return compact ? (
      <>
        <Skel h={64} />
        <Skel h={64} />
        <Skel h={64} />
      </>
    ) : (
      <Spinner label="Finding technicians…" />
    );
  }

  if (error) {
    return (
      <Card className="text-center">
        <p className="text-muted-foreground">Couldn&apos;t load technicians. {error}</p>
      </Card>
    );
  }

  return (
    <div className={compact ? undefined : "flex flex-col gap-4"}>
      {/* The phone lane has its own input, chip and row styles. Rendering
          the web primitives inside the phone Screen is what made this search
          bar sit out of line with every other field on the tab. */}
      {compact ? (
        <label className="in">
          <KIcon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or trade"
            aria-label="Search technicians"
          />
        </label>
      ) : (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or trade"
          aria-label="Search technicians"
          prefix={<Icon name="search" size="sm" />}
        />
      )}

      {offered.length > 0 &&
        (compact ? (
          <div className="chips wrap" role="tablist" aria-label="Trades">
            <button
              type="button"
              role="tab"
              aria-selected={cat === "all"}
              className={clsx("chip", cat === "all" && "sel")}
              onClick={() => setCat("all")}
            >
              All trades
            </button>
            {offered.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={cat === c.id}
                className={clsx("chip", cat === c.id && "sel")}
                onClick={() => setCat(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Chip active={cat === "all"} onClick={() => setCat("all")}>
              All trades
            </Chip>
            {offered.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        ))}

      {tradesUnavailable && (
        <p className="text-xs text-muted-foreground">
          Trades aren&apos;t available right now, so everyone is listed. Run
          supabase/patch_v31_requested_provider.sql to enable filtering.
        </p>
      )}

      {shown.length === 0 ? (
        compact ? (
          <EmptyK
            icon="users"
            title="No technicians match"
            hint={
              query.trim() || cat !== "all"
                ? "Try a different trade, or clear the search."
                : "Verified technicians appear here as they join."
            }
          />
        ) : (
          <EmptyState
            icon="users"
            title="No technicians match"
            hint={
              query.trim() || cat !== "all"
                ? "Try a different trade, or clear the search."
                : "Verified technicians appear here as they join."
            }
          />
        )
      ) : compact ? (
        <div className="list">
          {shown.map((t) => (
            <Link key={t.id} className="pro-row card" href={`/providers/view/?id=${t.id}`}>
              <Ava name={proName(t)} src={t.avatar_url} verified />
              <div>
                <b>{proName(t)}</b>
                <small>
                  {t.categoryNames.length
                    ? t.categoryNames.slice(0, 3).join(" · ")
                    : (t.service_areas?.slice(0, 2).join(" · ") ?? "Karachi")}
                </small>
                <Rate
                  value={Number(t.rating_avg)}
                  suffix={`${t.jobs_completed.toLocaleString("en-PK")} jobs`}
                />
              </div>
              <KIcon name="chev-r" className="chev" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((t) => (
            <Link
              key={t.id}
              href={`/providers/view/?id=${t.id}`}
              className="rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary"
            >
              <div className="flex items-start gap-3">
                <Avatar name={proName(t)} src={t.avatar_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{proName(t)}</span>
                    <Pill tone="ok" icon="shield">
                      Verified
                    </Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <Rating value={Number(t.rating_avg)} /> ·{" "}
                    {t.jobs_completed.toLocaleString("en-PK")} jobs
                    {t.service_areas?.length ? ` · ${t.service_areas.slice(0, 2).join(", ")}` : ""}
                  </p>
                  {t.categoryNames.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.categoryNames.slice(0, 4).join(" · ")}
                    </p>
                  )}
                  {t.bio && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.bio}</p>
                  )}
                </div>
                <Icon
                  name="chevron"
                  size="sm"
                  className="mt-1 shrink-0 text-muted-foreground rtl:-scale-x-100"
                />
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Asking for someone holds the job for them for 10 minutes
        <InfoTip label="About requesting a technician">
          We offer the job to them first and nobody else can see it. If they haven&apos;t taken it
          after 10 minutes it opens to other nearby technicians, so you are never left waiting on
          one person.
        </InfoTip>
      </p>
    </div>
  );
}
