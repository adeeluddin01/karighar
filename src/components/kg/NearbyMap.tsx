"use client";

import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { MapController } from "@/components/maps/MapController";
import { MapGate } from "@/components/maps/MapGate";
import { MapArt } from "@/components/kg/MapArt";
import { GOOGLE_MAPS_KEY, KARACHI_CENTER, NAV_MAP_STYLE, type LatLng } from "@/lib/maps";

export type MapJob = { id: string; title: string; lat: number; lng: number };

/**
 * The live map behind the Map screen's sheet. Fills its `.map` parent.
 *
 * Plots what the app actually knows a position for: the customer's saved
 * address and their open bookings. Providers have no stored coordinates, so
 * they're listed in the sheet rather than pinned.
 *
 * Falls back to the redesign's illustrated map when Google Maps has no key or
 * fails to load, so the screen still reads as designed.
 */
export function NearbyMap({
  home,
  jobs = [],
  recenter,
}: {
  home: LatLng | null;
  jobs?: MapJob[];
  /** New object identity re-pans the map; used by the locate button. */
  recenter?: LatLng | null;
}) {
  if (!GOOGLE_MAPS_KEY) return <MapArt kind="nearby" pins={[]} />;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <MapGate fallback={<MapArt kind="nearby" pins={[]} />}>
        <div style={{ position: "absolute", inset: 0 }}>
          <Map
            defaultCenter={home ?? KARACHI_CENTER}
            defaultZoom={home ? 14 : 12}
            styles={NAV_MAP_STYLE}
            gestureHandling="greedy"
            disableDefaultUI
          >
            <MapController target={recenter ?? null} />
            {home && (
              <Marker
                position={home}
                title="Your saved address"
                icon={{ url: "data:image/svg+xml;utf8," + encodeURIComponent(HOME_PIN) }}
              />
            )}
            {jobs.map((j) => (
              <Marker key={j.id} position={{ lat: j.lat, lng: j.lng }} title={j.title} />
            ))}
          </Map>
        </div>
      </MapGate>
    </APIProvider>
  );
}

// The saffron dot the redesign uses for "you are here".
const HOME_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="8" fill="#ee7118" stroke="white" stroke-width="3"/></svg>`;
