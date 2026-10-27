"use client";

import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { MapController } from "@/components/maps/MapController";
import { MapGate } from "@/components/maps/MapGate";
import { MapArt } from "@/components/kg/MapArt";
import { GOOGLE_MAPS_KEY, KARACHI_CENTER, NAV_MAP_STYLE, type LatLng } from "@/lib/maps";
import { businessPin } from "@/lib/mapGlyphs";
import type { BusinessPin } from "@/lib/businesses";

export type MapJob = { id: string; title: string; lat: number; lng: number };

/**
 * The live map behind the Map screen's sheet. Fills its `.map` parent.
 *
 * Plots what the app actually knows a position for: the customer's saved
 * address, their open bookings, and any service companies. Individual
 * technicians have no stored coordinates anywhere in the schema, so they stay
 * listed in the sheet rather than pinned — a business is a place, a
 * technician is a person who travels.
 *
 * Falls back to the redesign's illustrated map when Google Maps has no key or
 * fails to load, so the screen still reads as designed.
 */
export function NearbyMap({
  home,
  jobs = [],
  businesses = [],
  onPickBusiness,
  recenter,
}: {
  home: LatLng | null;
  jobs?: MapJob[];
  businesses?: BusinessPin[];
  onPickBusiness?: (id: string) => void;
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
            {/* The first trade carries the icon — a company that does three
                things gets one pin, not three, and the sheet row below lists
                the rest. */}
            {businesses.map((b) => (
              <Marker
                key={b.id}
                position={{ lat: b.lat, lng: b.lng }}
                title={businessTitle(b)}
                icon={{ url: businessPin(b.trades[0]?.icon ?? null) }}
                onClick={onPickBusiness ? () => onPickBusiness(b.id) : undefined}
              />
            ))}
          </Map>
        </div>
      </MapGate>
    </APIProvider>
  );
}

// The marker's hover/accessible label: who, and what they do. Google renders
// `title` as plain text, so the trade names carry what the icon abbreviates.
function businessTitle(b: BusinessPin) {
  const name = b.full_name?.trim() || "Service company";
  return b.trades.length ? `${name} — ${b.trades.map((t) => t.name).join(", ")}` : name;
}

// The saffron dot the redesign uses for "you are here".
const HOME_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="8" fill="#ee7118" stroke="white" stroke-width="3"/></svg>`;
