"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { createClient } from "@/lib/supabase/client";
import { MapController } from "@/components/maps/MapController";
import { MapGate } from "@/components/maps/MapGate";
import { MapArt } from "@/components/kg/MapArt";
import { GOOGLE_MAPS_KEY, KARACHI_CENTER, NAV_MAP_STYLE, type LatLng } from "@/lib/maps";

/**
 * The live map behind the tracking sheet — fills its `.map` parent instead of
 * sitting in a bordered box like the pro-side `<TrackingMap>`.
 *
 * Falls back to the redesign's illustrated map whenever a real one can't be
 * drawn: no Google Maps key, the API failing to load, or the pro not sharing a
 * location yet. The screen therefore always looks like the design.
 */
export function TrackMap({
  jobId,
  destination,
  onProPos,
}: {
  jobId: string;
  destination: LatLng | null;
  /** Reports the pro's live position up, so the sheet can show "sharing live". */
  onProPos?: (pos: LatLng | null) => void;
}) {
  const [proPos, setProPos] = useState<LatLng | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    function take(lat: number | null, lng: number | null) {
      if (!active || lat == null || lng == null) return;
      const next = { lat, lng };
      setProPos(next);
      onProPos?.(next);
    }

    (async () => {
      const { data } = await supabase
        .from("job_tracking")
        .select("provider_lat,provider_lng")
        .eq("job_id", jobId)
        .maybeSingle();
      const row = data as { provider_lat: number | null; provider_lng: number | null } | null;
      take(row?.provider_lat ?? null, row?.provider_lng ?? null);
    })();

    const channel = supabase
      .channel(`kg-track:${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_tracking", filter: `job_id=eq.${jobId}` },
        (payload) => {
          const row = payload.new as { provider_lat: number | null; provider_lng: number | null };
          take(row.provider_lat, row.provider_lng);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // onProPos is a reporting callback; re-subscribing when it changes identity
    // would tear down the channel on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Nothing real to draw yet — show the illustrated route.
  if (!GOOGLE_MAPS_KEY || (!proPos && !destination)) return <MapArt kind="track" />;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <MapGate fallback={<MapArt kind="track" />}>
        <div style={{ position: "absolute", inset: 0 }}>
          <Map
            defaultCenter={proPos ?? destination ?? KARACHI_CENTER}
            defaultZoom={15}
            styles={NAV_MAP_STYLE}
            gestureHandling="greedy"
            disableDefaultUI
          >
            <MapController target={proPos} />
            {destination && <Marker position={destination} title="Service location" />}
            {proPos && (
              <Marker
                position={proPos}
                title="Your pro"
                icon={{ url: "data:image/svg+xml;utf8," + encodeURIComponent(PRO_PIN) }}
              />
            )}
          </Map>
        </div>
      </MapGate>
    </APIProvider>
  );
}

// The leaf dot the redesign uses for the pro's live position.
const PRO_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="9" fill="#139a72" stroke="white" stroke-width="3"/></svg>`;
