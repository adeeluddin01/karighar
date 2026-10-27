"use client";

import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { FitToJobs } from "@/components/maps/JobsMapParts";
import { MapGate } from "@/components/maps/MapGate";
import { GOOGLE_MAPS_KEY, KARACHI_CENTER } from "@/lib/maps";
import { businessPin } from "@/lib/mapGlyphs";
import { businessName, type BusinessPin } from "@/lib/businesses";

/**
 * The web lane's company map.
 *
 * This is the only thing on /map that can be plotted at all: individual
 * technicians have no coordinates anywhere in the schema — they have
 * `service_areas`, which is a list of neighbourhood names — whereas a
 * business is a licensed premises with a pin the admin recorded when the
 * account was granted (patch_v22).
 *
 * Renders nothing without a key or without companies, so a deployment with
 * neither sees the page exactly as it was.
 */
export function BusinessesMap({
  firms,
  selected,
  onSelect,
}: {
  firms: BusinessPin[];
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  if (!GOOGLE_MAPS_KEY || firms.length === 0) return null;

  const points = firms.map((f) => ({ lat: f.lat, lng: f.lng }));

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <MapGate>
        <div className="h-80 w-full overflow-hidden rounded-xl border border-border">
          <Map
            defaultCenter={KARACHI_CENTER}
            defaultZoom={11}
            gestureHandling="cooperative"
            disableDefaultUI
            zoomControl
          >
            <FitToJobs points={points} />
            {firms.map((f) => (
              <Marker
                key={f.id}
                position={{ lat: f.lat, lng: f.lng }}
                title={markerTitle(f)}
                icon={{ url: businessPin(f.trades[0]?.icon ?? null, selected === f.id) }}
                zIndex={selected === f.id ? 2 : 1}
                onClick={onSelect ? () => onSelect(f.id) : undefined}
              />
            ))}
          </Map>
        </div>
      </MapGate>
    </APIProvider>
  );
}

// Google renders `title` as plain text on hover, so the trade names spell out
// what the icon abbreviates.
function markerTitle(f: BusinessPin) {
  const name = businessName(f);
  return f.trades.length ? `${name} — ${f.trades.map((t) => t.name).join(", ")}` : name;
}
