"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Button, Card, PageHeader, Pill, Spinner, formatPKR } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MapGate } from "@/components/maps/MapGate";
import { Directions, FitToJobs, type RouteInfo } from "@/components/maps/JobsMapParts";
import { BARE_MAP_STYLE, GOOGLE_MAPS_KEY, KARACHI_CENTER, googleDirectionsUrl, type LatLng } from "@/lib/maps";
import type { Job } from "@/lib/types";

type Pinned = Job & { lat: number; lng: number };

const MINE = "#139a72"; // leaf — your active jobs
const OPEN = "#ee7118"; // saffron — available to claim

export default function ProviderMapPage() {
  const { user, loading } = useRequireAuth("/pro/map");
  const [mine, setMine] = useState<Pinned[]>([]);
  const [open, setOpen] = useState<Pinned[]>([]);

  const [selected, setSelected] = useState<Pinned | null>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [routeTo, setRouteTo] = useState<Pinned | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [full, setFull] = useState(false);

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

  /** Ask the browser where we are, then route to `job`. */
  const startDirections = useCallback((job: Pinned) => {
    setRouteError(null);
    setRoute(null);
    if (!navigator.geolocation) {
      setRouteError("This browser can't share your location, so in-app directions aren't available.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRouteTo(job);
      },
      () => {
        setLocating(false);
        setRouteError("Location permission denied — allow it, or open the route in Google Maps.");
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  const clearRoute = useCallback(() => {
    setRouteTo(null);
    setRoute(null);
    setRouteError(null);
  }, []);

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
        subtitle="Only your jobs are drawn on it — green dots are yours, orange dots are up for grabs. Tap one for directions."
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
                {origin && routeTo && (
                  <Dot at={origin} title="You" color="#17251f" r={11} z={3} />
                )}

                <FitToJobs points={points} paused={!!routeTo} refitKey={full ? "full" : "inline"} />
                <Directions
                  origin={routeTo ? origin : null}
                  destination={routeTo ? { lat: routeTo.lat, lng: routeTo.lng } : null}
                  onResult={setRoute}
                  onError={setRouteError}
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

              {routeTo && (
                <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-soft">
                  <span className="text-sm font-semibold">
                    {route ? `${route.distance} · ${route.duration}` : "Finding route…"}
                  </span>
                  <button
                    type="button"
                    onClick={clearRoute}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
              )}

              {selected && (
                <div className="absolute inset-x-3 bottom-3 z-10">
                  <JobCard
                    job={selected}
                    mine={mine.some((j) => j.id === selected.id)}
                    locating={locating}
                    onDirections={() => startDirections(selected)}
                    onClose={() => setSelected(null)}
                  />
                </div>
              )}
            </MapGate>
          </APIProvider>
        </div>
      )}

      {routeError && (
        <Card className="mt-4 bg-warning-light">
          <p className="text-sm text-warning-foreground">{routeError}</p>
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
  onDirections,
  onClose,
}: {
  job: Pinned;
  mine: boolean;
  locating: boolean;
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

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onDirections} disabled={locating}>
          <Icon name="navigate" size="sm" />
          {locating ? "Locating…" : "Directions here"}
        </Button>
        <a
          href={googleDirectionsUrl({ lat: job.lat, lng: job.lng })}
          target="_blank"
          rel="noopener"
          className="btn-ghost btn-sm"
        >
          <Icon name="send" size="sm" />
          Google Maps
        </a>
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
