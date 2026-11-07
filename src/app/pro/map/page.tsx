"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { useLanguage } from "@/lib/i18n";
import {
  DEFAULT_JOB_FILTERS,
  filterJobs,
  serviceOptions,
  type JobFilters,
  type ServiceOption,
} from "@/lib/jobFilters";
import { JobFilters as JobFiltersBar } from "@/components/JobFilters";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { ProJobsList } from "@/components/ProJobsList";
import { Button, Card, LinkButton, PageHeader, Pill, Spinner, formatPKR } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ProViewToggle } from "@/components/ProViewToggle";
import { MapGate } from "@/components/maps/MapGate";
import { MapController } from "@/components/maps/MapController";
import { Directions, FitToJobs } from "@/components/maps/JobsMapParts";
import { useRouteToJob } from "@/components/maps/useRouteToJob";
import { BARE_MAP_STYLE, GOOGLE_MAPS_KEY, KARACHI_CENTER, googleDirectionsUrl, type LatLng } from "@/lib/maps";
import type { BusinessMember, Job, Profile, Provider, PublicCustomerRating } from "@/lib/types";
import { dbErrorMessage } from "@/lib/dbErrors";

type Pinned = Job & { lat: number; lng: number };

const MINE = "#139a72"; // leaf — your active jobs
const OPEN = "#ee7118"; // saffron — available to claim

// Keeps the floating card clear of <BottomNav> (fixed, 66px) on phones. In
// fullscreen the map is z-50, so without this the card paints over the tab bar.
const BOTTOM_SLOT =
  "absolute inset-x-3 z-10 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-3";

/**
 * External Google Maps directions to a job. Origin is deliberately omitted —
 * Google then routes from the device itself, which needs neither the
 * Directions API nor location permission. The address keeps the link usable
 * for a job that was never pinned.
 */
function directionsHref(job: Pinned) {
  return googleDirectionsUrl({ lat: job.lat, lng: job.lng }, { address: job.address });
}

export default function ProviderMapPage() {
  const { user, profile, loading } = useRequireAuth("/pro/map");
  const { t } = useLanguage();
  const router = useRouter();
  const toast = useToast();

  // Pro-area page: a signed-in non-provider opening the URL directly gets
  // their own home, not an empty map. Customers have their own /map;
  // pending providers pass — the check is profile.role, not approval.
  useEffect(() => {
    if (!loading && profile && profile.role !== "provider") {
      router.replace(
        profile.role === "customer" ? "/" : profile.role === "business" ? "/business" : "/admin",
      );
    }
  }, [loading, profile, router]);
  // The view switch — List and Map are two views of this tab, never a
  // navigation. (List used to link to /pro/dashboard, which read as a
  // redirect; the dashboard IS the list view.)
  const [view, setView] = useState<"list" | "map">("map");
  const [mine, setMine] = useState<Pinned[]>([]);
  const [open, setOpen] = useState<Pinned[]>([]);
  // The list area needs the FULL lists, not just pinned jobs, plus the
  // provider row (open pool only for approved pros), the team (attached
  // techs get no open pool) and the customer ratings — the same data the
  // dashboard loads. The map dots are derived from these by `pinned()`.
  const [provider, setProvider] = useState<Provider | null>(null);
  const [team, setTeam] = useState<{ name: string | null } | null>(null);
  const [mineAll, setMineAll] = useState<Job[]>([]);
  const [openAll, setOpenAll] = useState<Job[]>([]);
  // `Map` here is the Google Maps component, not the JS one — hence
  // `globalThis.Map` for the ratings lookup.
  const [custRatings, setCustRatings] = useState<Map<string, PublicCustomerRating>>(
    new globalThis.Map()
  );
  const [claiming, setClaiming] = useState(false);
  // Same filters as the dashboard list — the map plots the same two lists,
  // so it filters them the same way rather than showing unfiltered dots.
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_JOB_FILTERS);

  const [selected, setSelected] = useState<Pinned | null>(null);
  const [full, setFull] = useState(false);
  // Set from <Directions>'s onError — an event callback, not an effect. Once
  // the Directions API has actually refused, stop offering the in-app button
  // rather than hard-coding "the key doesn't have it".
  const [inAppBroken, setInAppBroken] = useState(false);
  // Shared with the active-job screen — see useRouteToJob.
  const route = useRouteToJob();

  // The one job a pro is most likely to be driving to — computed below,
  // once the filtered lists exist. With several active jobs there is no
  // single answer, so fall back to tapping a dot.

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: prov } = await supabase
      .from("providers")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();
    setProvider(prov as Provider | null);

    const { data: memberships } = await supabase
      .from("business_members")
      .select("*")
      .eq("provider_id", user.id)
      .eq("status", "active");
    const activeRow = ((memberships as BusinessMember[]) || [])[0] ?? null;
    if (activeRow) {
      const { data: biz } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", activeRow.business_id)
        .maybeSingle();
      setTeam({ name: (biz as Profile | null)?.full_name ?? null });
    } else {
      setTeam(null);
    }

    const approved = (prov as Provider | null)?.status === "approved";
    const [{ data: o }, { data: a }, { data: svcRows }] = await Promise.all([
      approved
        ? supabase
            .from("jobs")
            .select("*")
            .is("provider_id", null)
            .in("status", ["created", "bidding"])
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      // Paid jobs are NOT here: they live in History, same as the dashboard.
      supabase
        .from("jobs")
        .select("*")
        .eq("provider_id", user.id)
        .not("status", "in", "(rated,cancelled,paid)")
        .order("created_at", { ascending: false }),
      supabase.from("services").select("id,name").eq("is_active", true).order("name"),
    ]);
    const openJobs = (o as Job[]) || [];
    const myJobs = (a as Job[]) || [];
    setOpenAll(openJobs);
    setMineAll(myJobs);
    const pinned = (rows: Job[]) =>
      rows.filter((j): j is Pinned => j.lat != null && j.lng != null);
    // Dots are the in-flight jobs only — a completed job isn't driven to.
    setMine(pinned(myJobs.filter((j) => ["assigned", "en_route", "arrived", "in_progress"].includes(j.status))));
    setOpen(pinned(openJobs));
    setServices((svcRows as ServiceOption[]) || []);

    const ids = [...new Set([...openJobs, ...myJobs].map((j) => j.customer_id))];
    if (ids.length) {
      const { data: ratings } = await supabase
        .from("public_customer_ratings")
        .select("*")
        .in("id", ids);
      setCustRatings(
        new globalThis.Map(((ratings as PublicCustomerRating[]) ?? []).map((r) => [r.id, r]))
      );
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Same mutations as the dashboard list — the list area calls these, and
  // the map dot's card claims a fixed job through the same path.
  async function acceptFixed(job: Job) {
    const { error } = await createClient()
      .from("jobs")
      .update({ provider_id: user!.id, status: "assigned" })
      .eq("id", job.id);
    if (error) {
      toast("Couldn't accept that job — " + dbErrorMessage(error), "error");
      return;
    }
    await load();
  }

  async function submitBid(jobId: string, amount: number, note: string | null) {
    await createClient().from("bids").insert({
      job_id: jobId,
      provider_id: user!.id,
      amount,
      note,
    });
    toast("Quote sent! The customer will be notified.", "success");
    await load();
  }

  async function claimFromCard(job: Pinned) {
    setClaiming(true);
    try {
      await acceptFixed(job);
    } finally {
      setClaiming(false);
    }
  }

  // Fullscreen is a CSS overlay rather than the Fullscreen API: iOS Safari
  // won't fullscreen a <div>, and this behaves the same everywhere.
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [full]);

  // Filtered lists drive the dots, the counts, and the "your active job"
  // bar below — unfiltered data never reaches the map. A filter change
  // also closes an open job card, so it can't show a job the filters hid.
  const svc = useMemo(
    () => serviceOptions([...mineAll, ...openAll], services),
    [mineAll, openAll, services]
  );
  const visibleMine = useMemo(() => filterJobs(mine, filters), [mine, filters]);
  const visibleOpen = useMemo(() => filterJobs(open, filters), [open, filters]);
  const visible = useMemo(() => [...visibleMine, ...visibleOpen], [visibleMine, visibleOpen]);

  const points = useMemo(
    () => visible.map((j) => ({ lat: j.lat, lng: j.lng })),
    [visible]
  );

  const soleActive = visibleMine.length === 1 ? visibleMine[0] : null;

  const attached = !!team;
  // Freelance cap (DB-enforced by patch v26): independent pros only.
  const atCap =
    !attached &&
    mineAll.filter((j) => ["assigned", "en_route", "arrived", "in_progress"].includes(j.status))
      .length >= 3;

  if (!loading && profile && profile.role !== "provider") return null;

  if (loading || !user) {
    return (
      <AppShell>
        <Spinner label="Loading map…" />
      </AppShell>
    );
  }

  const total = visibleMine.length + visibleOpen.length;

  return (
    <AppShell>
      <PageHeader title={t("pro.jobsMap")} subtitle={t("pro.mapSubtitle")} />
      <div className="mb-4">
        <ProViewToggle value={view} onChange={setView} />
      </div>

      {view === "list" ? (
        <ProJobsList
          available={openAll}
          mine={mineAll}
          services={services}
          custRatings={custRatings}
          atCap={atCap}
          attached={attached}
          teamName={team?.name}
          onAccept={acceptFixed}
          onSubmitBid={submitBid}
          filters={filters}
          onFiltersChange={setFilters}
          headerActions={
            <LinkButton href="/pro/history" variant="ghost" size="sm" icon="history">
              {t("pro.history")}
            </LinkButton>
          }
        />
      ) : (
        <>

      {/* Unconditional: the bar is part of the tab, not of the data. A pro
          with no jobs yet still sees the controls; the empty map below
          explains why there is nothing to filter. Gating it on having jobs
          made the feature look missing. The dots stay pinned-only. */}
      <div className="mb-4">
        <JobFiltersBar
          services={svc.options}
          hasCustom={svc.hasCustom}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setSelected(null);
          }}
        />
      </div>

      {!GOOGLE_MAPS_KEY ? (
        <Card className="bg-warning-light text-warning-foreground">
          Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in <code>.env.local</code> to enable the map.
        </Card>
      ) : (
        <div
          className="mapbox"
          // All inline, not utility classes: `.legacy-ui .mapbox` sets both
          // `position` and `height` at two-class specificity, so `fixed` and
          // `h-[100dvh]` would lose to it. MapPicker sizes itself this way too.
          style={
            full
              ? {
                  position: "fixed",
                  inset: 0,
                  width: "100vw",
                  height: "100dvh",
                  borderRadius: 0,
                  zIndex: 50,
                }
              : { height: "30vh" }
          }
        >
          <APIProvider apiKey={GOOGLE_MAPS_KEY}>
            <MapGate>
              <Map
                defaultCenter={KARACHI_CENTER}
                defaultZoom={12}
                styles={BARE_MAP_STYLE}
                gestureHandling="greedy"
                disableDefaultUI
                zoomControl
                clickableIcons={false}
                onClick={() => setSelected(null)}
              >
                {visibleMine.map((j) => (
                  <Dot
                    key={j.id}
                    at={{ lat: j.lat, lng: j.lng }}
                    title={j.title}
                    color={MINE}
                    z={2}
                    onClick={() => setSelected(j)}
                  />
                ))}
                {visibleOpen.map((j) => (
                  <Dot
                    key={j.id}
                    at={{ lat: j.lat, lng: j.lng }}
                    title={`${j.title} (available)`}
                    color={OPEN}
                    z={1}
                    onClick={() => setSelected(j)}
                  />
                ))}
                {/* Shown whenever the position is known, not only mid-route.
                    Gating this on `route.active` meant a provider could never
                    see themselves, because starting a route is exactly what
                    fails when the Directions API is off. */}
                {route.origin && <Dot at={route.origin} title="You" color="#17251f" r={11} z={3} />}

                {/* Pans to the user after locating; identity-keyed, and
                    `locate()` returns a fresh object each call so repeat
                    taps re-centre. */}
                <MapController target={route.origin} />

                <FitToJobs
                  points={points}
                  paused={route.active || route.located}
                  refitKey={full ? "full" : "inline"}
                />
                <Directions
                  origin={route.origin}
                  destination={route.destination}
                  onResult={route.onResult}
                  onError={(message) => {
                    setInAppBroken(true);
                    route.onError(message);
                  }}
                />
              </Map>

              {/* Map chrome — stays put in both normal and fullscreen. */}
              <button
                type="button"
                onClick={() => setFull((f) => !f)}
                aria-label={full ? "Exit fullscreen" : "Fullscreen map"}
                className="absolute end-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-xl bg-card shadow-soft"
              >
                <Icon name={full ? "shrink" : "expand"} size="sm" />
              </button>

              {/* Put yourself on the map, independent of any route. Outside
                  <Map> like the toggle above, so nothing here constructs a
                  google.maps.* value before the API has loaded. */}
              <button
                type="button"
                onClick={route.locate}
                disabled={route.locating}
                aria-label="Show my location"
                aria-busy={route.locating}
                className="absolute end-3 top-[3.75rem] z-10 grid h-10 w-10 place-items-center rounded-xl bg-card shadow-soft disabled:opacity-60"
              >
                <Icon name="locate" size="sm" />
              </button>

              {route.active && (
                <div className="absolute start-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-soft">
                  <span className="text-sm font-semibold">
                    {route.route ? `${route.route.distance} · ${route.route.duration}` : "Finding route…"}
                  </span>
                  <button
                    type="button"
                    onClick={route.clearRoute}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
              )}

              {selected ? (
                <div className={BOTTOM_SLOT}>
                  <JobCard
                    job={selected}
                    mine={visibleMine.some((j) => j.id === selected.id)}
                    locating={route.locating}
                    inAppBroken={inAppBroken}
                    claiming={claiming}
                    atCap={atCap}
                    onClaim={claimFromCard}
                    onQuote={() => setView("list")}
                    onDirections={() => route.startDirections({ lat: selected.lat, lng: selected.lng })}
                    onClose={() => setSelected(null)}
                  />
                </div>
              ) : (
                // With exactly one active job, don't make the pro hunt for
                // its dot — the job they're driving to is not ambiguous.
                soleActive && (
                  <div className={BOTTOM_SLOT}>
                    <ActiveJobBar job={soleActive} />
                  </div>
                )
              )}
            </MapGate>
          </APIProvider>
        </div>
      )}

      {(route.routeError || route.locateError) && (
        <Card className="mt-4 bg-warning-light">
          {route.locateError && (
            <p className="text-sm text-warning-foreground">{route.locateError}</p>
          )}
          {route.routeError && (
            <p className="text-sm text-warning-foreground">{route.routeError}</p>
          )}
          {/* Never a dead end: in-app routing needs the Directions API, the
              external link needs nothing at all. */}
          {route.routeError && (selected ?? soleActive) && (
            <a
              href={directionsHref(selected ?? soleActive!)}
              target="_blank"
              rel="noopener"
              className="btn-primary btn-sm mt-3"
            >
              <Icon name="navigate" size="sm" /> Open in Google Maps instead
            </a>
          )}
        </Card>
      )}

      {total === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {mine.length + open.length === 0 ? t("pro.noPinned") : t("filters.noMatch")}
        </p>
      )}
        </>
      )}
    </AppShell>
  );
}

function JobCard({
  job,
  mine,
  locating,
  inAppBroken,
  claiming,
  atCap,
  onClaim,
  onQuote,
  onDirections,
  onClose,
}: {
  job: Pinned;
  mine: boolean;
  locating: boolean;
  /** The Directions API has already refused once — stop offering it. */
  inAppBroken: boolean;
  claiming: boolean;
  atCap: boolean;
  /** Claim a fixed job in place (no dashboard round-trip). */
  onClaim: (job: Pinned) => void;
  /** A custom job needs the quote form — switch to the List area. */
  onQuote: () => void;
  onDirections: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold">{job.title}</p>
            <Pill tone={mine ? "ok" : "warn"}>{mine ? t("pro.yours") : t("pro.available")}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{job.address}</p>
        </div>
        <div className="shrink-0 text-end">
          <p className="font-bold">{formatPKR(job.price)}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("common.close")}
          </button>
        </div>
      </div>

      {/* Google Maps leads: it works with no Directions API and no location
          permission. The in-app route is the extra, and it removes itself
          once the API has actually turned it down. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={directionsHref(job)}
          target="_blank"
          rel="noopener"
          className="btn-primary btn-sm"
        >
          <Icon name="navigate" size="sm" />
          {t("pro.openInMaps")}
        </a>
        {!inAppBroken && (
          <Button size="sm" variant="ghost" onClick={onDirections} disabled={locating}>
            <Icon name="send" size="sm" />
            {locating ? "Locating…" : t("pro.showRoute")}
          </Button>
        )}
        {mine ? (
          <Link href={`/pro/jobs/view/?id=${job.id}`} className="btn-ghost btn-sm">
            {t("pro.openJob")}
            <Icon name="chevron" size="sm" className="rtl:-scale-x-100" />
          </Link>
        ) : job.type === "fixed" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={claiming || atCap}
            onClick={() => onClaim(job)}
          >
            {atCap ? t("pro.atCap") : t("pro.claimIt")}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon="chevron" onClick={onQuote}>
            {t("pro.sendQuote")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * A plain dot — no glyph, nothing to compete with at low zoom.
 *
 * This has to be its own component. <Map> renders children only once the map
 * exists, but the parent *creates* those elements (and evaluates their props)
 * before that — so building a `google.maps.Point` in the parent's render runs
 * before the API has loaded. Done here, it runs only when <Map> renders us.
 */
function Dot({
  at,
  title,
  color,
  r = 9,
  z,
  onClick,
}: {
  at: LatLng;
  title: string;
  color: string;
  r?: number;
  z?: number;
  onClick?: () => void;
}) {
  const size = (r + 4) * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}" stroke="white" stroke-width="3"/></svg>`;
  return (
    <Marker
      position={at}
      title={title}
      zIndex={z}
      onClick={onClick}
      icon={{
        url: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
        anchor: new google.maps.Point(size / 2, size / 2),
      }}
    />
  );
}

/**
 * Shown when a pro has exactly one active job and nothing is selected. The
 * job they are driving to is not in doubt, so directions shouldn't require
 * finding and tapping its dot first.
 */
function ActiveJobBar({ job }: { job: Pinned }) {
  const { t } = useLanguage();
  return (
    <Card className="shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{t("pro.yourActiveJob")}</p>
          <p className="truncate font-bold">{job.title}</p>
          <p className="truncate text-sm text-muted-foreground">{job.address}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href={directionsHref(job)}
            target="_blank"
            rel="noopener"
            className="btn-primary btn-sm"
          >
            <Icon name="navigate" size="sm" />
            {t("pro.directions")}
          </a>
          <Link href={`/pro/jobs/view/?id=${job.id}`} className="btn-ghost btn-sm">
            {t("pro.openJob")}
            <Icon name="chevron" size="sm" className="rtl:-scale-x-100" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
