"use client";

import { useCallback, useState } from "react";
import type { LatLng } from "@/lib/maps";
import type { RouteInfo } from "@/components/maps/JobsMapParts";

/* ============================================================
   The "draw me a route to this job" state machine.

   Written for the provider's jobs map, and needed verbatim by their
   active-job screen, so it lives here rather than being copied. Pair it with
   <Directions> from JobsMapParts, which has to render inside <Map>:

     <Directions origin={r.origin} destination={r.destination}
                 onResult={r.onResult} onError={r.onError} />
   ============================================================ */

export function useRouteToJob() {
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  /**
   * Route to `dest`.
   *
   * `from` skips the geolocation prompt — pass the position already being
   * shared through `job_tracking` when there is one, so a technician who is
   * mid-job isn't asked for permission a second time.
   */
  const startDirections = useCallback((dest: LatLng, from?: LatLng | null) => {
    setRouteError(null);
    setRoute(null);

    if (from) {
      setOrigin(from);
      setDestination(dest);
      return;
    }

    if (!navigator.geolocation) {
      setRouteError("This browser can't share your location, so in-app directions aren't available.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setDestination(dest);
      },
      () => {
        setLocating(false);
        setRouteError("Location permission denied — allow it, or open the route in Google Maps.");
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, []);

  const clearRoute = useCallback(() => {
    setDestination(null);
    setRoute(null);
    setRouteError(null);
  }, []);

  return {
    origin,
    destination,
    route,
    routeError,
    locating,
    /** A route is showing (or being fetched) — e.g. to pause auto-fitting. */
    active: destination !== null,
    startDirections,
    clearRoute,
    onResult: setRoute,
    onError: setRouteError,
  };
}
