"use client";

import { useEffect, useRef, useState } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/lib/maps";

/* Pieces that have to render inside <Map> so they can reach the map instance. */

/**
 * Frames every job on screen, so they're all visible "from far away" instead
 * of the provider hunting around at a fixed zoom. Backs off while a route is
 * showing — the directions renderer owns the viewport then.
 */
export function FitToJobs({
  points,
  paused,
  refitKey,
}: {
  points: LatLng[];
  paused?: boolean;
  /** Change this to re-frame after the container resizes (e.g. fullscreen). */
  refitKey?: string;
}) {
  const map = useMap();
  // Re-fit only when the actual set of points changes, not on every render.
  const key = points.map((p) => `${p.lat},${p.lng}`).join("|") + "@" + (refitKey ?? "");

  useEffect(() => {
    if (!map || paused || !points.length) return;

    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 64);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, paused]);

  return null;
}

export type RouteInfo = { distance: string; duration: string };

/**
 * In-app turn-by-turn: draws the driving route from `origin` to `destination`
 * on the map itself.
 *
 * Markers are suppressed — the job dots underneath are the whole point of this
 * screen, and Google's default A/B pins would put icons back on it.
 */
export function Directions({
  origin,
  destination,
  onResult,
  onError,
}: {
  origin: LatLng | null;
  destination: LatLng | null;
  onResult: (info: RouteInfo | null) => void;
  onError: (message: string) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const [renderer, setRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

  // Keep the latest callbacks without making them re-trigger the request.
  // Updated in an effect, not during render — a ref write during render is
  // a React violation (react-hooks/refs).
  const cb = useRef({ onResult, onError });
  useEffect(() => {
    cb.current = { onResult, onError };
  });

  useEffect(() => {
    if (!routesLib || !map) return;
    const r = new routesLib.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: false,
      polylineOptions: {
        strokeColor: "#139a72",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      },
    });
    setRenderer(r);
    return () => r.setMap(null);
  }, [routesLib, map]);

  useEffect(() => {
    if (!routesLib || !renderer || !map) return;

    if (!origin || !destination) {
      renderer.setMap(null);
      return;
    }

    let cancelled = false;
    const service = new routesLib.DirectionsService();
    service
      .route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      })
      .then((result) => {
        if (cancelled) return;
        renderer.setMap(map);
        renderer.setDirections(result);
        const leg = result.routes[0]?.legs[0];
        cb.current.onResult(
          leg ? { distance: leg.distance?.text ?? "—", duration: leg.duration?.text ?? "—" } : null
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        renderer.setMap(null);
        cb.current.onResult(null);
        // REQUEST_DENIED almost always means the Directions API isn't enabled
        // on the key, which is worth saying plainly rather than "failed".
        const status = (e as { code?: string })?.code ?? "";
        cb.current.onError(
          status === "REQUEST_DENIED"
            ? "In-app directions need the Directions API enabled on your Google Maps key."
            : "Couldn't work out a route. Try opening it in Google Maps instead."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [routesLib, renderer, map, origin, destination]);

  return null;
}
