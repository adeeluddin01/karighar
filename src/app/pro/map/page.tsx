"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Button, Card, PageHeader, Pill, Spinner, formatPKR } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MapGate } from "@/components/maps/MapGate";
import { MapController } from "@/components/maps/MapController";
import { Directions, FitToJobs } from "@/components/maps/JobsMapParts";
import { useRouteToJob } from "@/components/maps/useRouteToJob";
import { BARE_MAP_STYLE, GOOGLE_MAPS_KEY, KARACHI_CENTER, googleDirectionsUrl, type LatLng } from "@/lib/maps";
import type { Job } from "@/lib/types";

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
  const { user, loading } = useRequireAuth("/pro/map");
  const [mine, setMine] = useState<Pinned[]>([]);
  const [open, setOpen] = useState<Pinned[]>([]);

  const [selected, setSelected] = useState<Pinned | null>(null);
  const [full, setFull] = useState(false);
  // Set from <Directions>'s onError — an event callback, not an effect. Once
  // the Directions API has actually refused, stop offering the in-app button
  // rather than hard-coding "the key doesn't have it".
  const [inAppBroken, setInAppBroken] = useState(false);
  // Shared with the active-job screen — see useRouteToJob.
  const route = useRouteToJob();

  // The one job a pro is most likely to be driving to. With several active
  // jobs there is no single answer, so fall back to tapping a dot.
  const soleActive = mine.length === 1 ? mine[0] : null;

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const [{ data: m }, { data: o }] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("provider_id", user.id)
          .in("status", ["assigned", "en_route", "arrived", "in_progress"]),
        supabase.from("jobs").select("*").is("provider_id", null).in("status", ["created", "bidding"]),
      ]);
      const pinned = (rows: Job[] | null) =>
        ((rows as Job[]) ?? []).filter((j): j is Pinned => j.lat != null && j.lng != null);
      setMine(pinned(m as Job[]));
      setOpen(pinned(o as Job[]));
    })();
  }, [user]);

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

  const points = useMemo(
    () => [...mine, ...open].map((j) => ({ lat: j.lat, lng: j.lng })),
    [mine, open]
  );

  if (loading || !user) {
    return (
      <AppShell>
        <Spinner label="Loading map…" />
      </AppShell>
    );
  }

  const total = mine.length + open.length;

  return (
    <AppShell>
      <PageHeader
        title="Jobs map"
        subtitle="Green dots are your jobs, orange ones are up for grabs. Tap a dot for directions, or use the locate button to put yourself on the map."
      />

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
              : { height: "70vh" }
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
                {mine.map((j) => (
                  <Dot
                    key={j.id}
                    at={{ lat: j.lat, lng: j.lng }}
                    title={j.title}
                    color={MINE}
                    z={2}
                    onClick={() => setSelected(j)}
                  />
                ))}
                {open.map((j) => (
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
                className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-xl bg-card shadow-soft"
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
                className="absolute right-3 top-[3.75rem] z-10 grid h-10 w-10 place-items-center rounded-xl bg-card shadow-soft disabled:opacity-60"
              >
                <Icon name="locate" size="sm" />
              </button>

              {route.active && (
                <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-soft">
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
                    mine={mine.some((j) => j.id === selected.id)}
                    locating={route.locating}
                    inAppBroken={inAppBroken}
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
        <p className="mt-4 text-sm text-muted-foreground">No jobs with a pinned location yet.</p>
      )}
    </AppShell>
  );
}

function JobCard({
  job,
  mine,
  locating,
  inAppBroken,
  onDirections,
  onClose,
}: {
  job: Pinned;
  mine: boolean;
  locating: boolean;
  /** The Directions API has already refused once — stop offering it. */
  inAppBroken: boolean;
  onDirections: () => void;
  onClose: () => void;
}) {
  return (
    <Card className="shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold">{job.title}</p>
            <Pill tone={mine ? "ok" : "warn"}>{mine ? "Yours" : "Available"}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{job.address}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-bold">{formatPKR(job.price)}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Close
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
          Open in Google Maps
        </a>
        {!inAppBroken && (
          <Button size="sm" variant="ghost" onClick={onDirections} disabled={locating}>
            <Icon name="send" size="sm" />
            {locating ? "Locating…" : "Show route here"}
          </Button>
        )}
        <Link
          href={mine ? `/pro/jobs/view/?id=${job.id}` : "/pro/dashboard"}
          className="btn-ghost btn-sm"
        >
          {mine ? "Open job" : "Claim it"}
          <Icon name="chevron" size="sm" />
        </Link>
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
  return (
    <Card className="shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Your active job</p>
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
            Directions
          </a>
          <Link href={`/pro/jobs/view/?id=${job.id}`} className="btn-ghost btn-sm">
            Open job
            <Icon name="chevron" size="sm" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
