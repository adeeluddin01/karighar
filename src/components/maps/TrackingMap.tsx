"use client";

import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { createClient } from "@/lib/supabase/client";
import { MapController } from "@/components/maps/MapController";
import { MapGate } from "@/components/maps/MapGate";
import { GOOGLE_MAPS_KEY, KARACHI_CENTER, NAV_MAP_STYLE, type LatLng } from "@/lib/maps";

/**
 * The destination pin + the pro's live location.
 *
 * `children` render inside <Map>, which is what <Directions> needs in order to
 * reach the map instance — that's how the provider's active-job screen draws a
 * route on this same map.
 */
export function TrackingMap({
  jobId,
  destination,
  audience = "customer",
  onProPos,
  children,
}: {
  jobId: string;
  destination: LatLng | null;
  /** Whose screen this is — the caption reads differently for each. */
  audience?: "customer" | "provider";
  /** The pro's live position, so a caller can route from it. */
  onProPos?: (p: LatLng) => void;
  children?: React.ReactNode;
}) {
  const [proPos, setProPos] = useState<LatLng | null>(null);

  // Kept in a ref so passing an inline callback doesn't re-run the
  // subscription effect on every render.
  const report = useRef(onProPos);
  useEffect(() => {
    report.current = onProPos;
  });

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("job_tracking")
        .select("provider_lat,provider_lng")
        .eq("job_id", jobId)
        .maybeSingle();
      if (data?.provider_lat != null) {
        const at = { lat: data.provider_lat, lng: data.provider_lng };
        setProPos(at);
        report.current?.(at);
      }
    })();

    const channel = supabase
      .channel(`track:${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_tracking", filter: `job_id=eq.${jobId}` },
        (payload) => {
          const row = payload.new as { provider_lat: number | null; provider_lng: number | null };
          if (row.provider_lat != null && row.provider_lng != null) {
            const at = { lat: row.provider_lat, lng: row.provider_lng };
            setProPos(at);
            report.current?.(at);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  if (!GOOGLE_MAPS_KEY) return null;
  const center = proPos ?? destination ?? KARACHI_CENTER;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <div className="mapbox">
        <MapGate>
          <Map
            defaultCenter={center}
            defaultZoom={15}
            styles={NAV_MAP_STYLE}
            gestureHandling="greedy"
            disableDefaultUI
            zoomControl
          >
            <MapController target={proPos} />
            {destination && <Marker position={destination} title="Service location" />}
            {proPos && (
              <Marker
                position={proPos}
                title={audience === "provider" ? "You" : "Your pro"}
                icon={{ url: "data:image/svg+xml;utf8," + encodeURIComponent(PRO_PIN) }}
              />
            )}
            {children}
          </Map>
        </MapGate>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {audience === "provider"
          ? proPos
            ? "🔵 You · 📍 the job"
            : "Start sharing your location to see yourself on the map…"
          : proPos
            ? "🔵 Your pro’s live location · 📍 service location"
            : "Waiting for your pro to share their location…"}
      </p>
    </APIProvider>
  );
}

const PRO_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="9" fill="#139a72" stroke="white" stroke-width="3"/></svg>`;
