"use client";

import { useCallback, useState } from "react";
import type { LatLng } from "@/lib/maps";
import type { RouteInfo } from "@/components/maps/JobsMapParts";
import {
  geolocationErrorMessage,
  geolocationUnsupportedMessage,
  type GeoIntent,
} from "@/lib/geolocation";

/* ============================================================
   Device location, and the "draw me a route to this job" state machine.

   Written for the provider's jobs map and reused by their active-job screen.
   Pair it with <Directions> from JobsMapParts, which has to render inside
   <Map>:

     <Directions origin={r.origin} destination={r.destination}
                 onResult={r.onResult} onError={r.onError} />

   Locating and routing are separate entry points on purpose. They used to be
   one: the only way to get a position was to start a route, so when the
   Directions API is disabled — as it is on this project's key — a provider
   could never see where they were. `locate()` fixes that, and keeps its own
   error channel so "GPS is off" never reads as "the Directions API is off".
   ============================================================ */

export function useRouteToJob() {
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [located, setLocated] = useState(false);

  /**
   * One shared wrapper around getCurrentPosition.
   *
   * `maximumAge` lets a second tap reuse a recent fix instead of waiting on
   * the GPS again; `enableHighAccuracy` can otherwise burn the full timeout
   * indoors.
   */
  const getPosition = useCallback(
    (intent: GeoIntent, onOk: (at: LatLng) => void, onFail: (message: string) => void) => {
      if (!navigator.geolocation) {
        onFail(geolocationUnsupportedMessage(intent));
        return;
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          onOk({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          setLocating(false);
          onFail(geolocationErrorMessage(err?.code, intent));
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
      );
    },
    []
  );

  /**
   * Just find the user, without starting a route. A fresh object every time,
   * so repeat taps re-pan a <MapController> that keys off identity.
   */
  const locate = useCallback(() => {
    setLocateError(null);
    getPosition(
      "locate",
      (at) => {
        setOrigin({ ...at });
        setLocated(true);
      },
      setLocateError
    );
  }, [getPosition]);

  /**
   * Route to `dest`.
   *
   * `from` skips the geolocation prompt — pass the position already being
   * shared through `job_tracking` when there is one, so a technician who is
   * mid-job isn't asked for permission a second time.
   */
  const startDirections = useCallback(
    (dest: LatLng, from?: LatLng | null) => {
      setRouteError(null);
      setRoute(null);

      if (from) {
        setOrigin({ ...from });
        setDestination(dest);
        return;
      }

      getPosition(
        "route",
        (at) => {
          setOrigin({ ...at });
          setDestination(dest);
        },
        setRouteError
      );
    },
    [getPosition]
  );

  /** Drops the route but keeps the known position — you are still there. */
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
    /** Kept apart from `routeError` so the two failures read differently. */
    locateError,
    locating,
    /** The user's position is known, so auto-fit should stop overriding it. */
    located,
    /** A route is showing (or being fetched) — e.g. to pause auto-fitting. */
    active: destination !== null,
    locate,
    startDirections,
    clearRoute,
    onResult: setRoute,
    onError: setRouteError,
  };
}
