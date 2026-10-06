"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, Marker, useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapController } from "@/components/maps/MapController";
import { MapGate } from "@/components/maps/MapGate";
import { GOOGLE_MAPS_KEY, KARACHI_CENTER, type LatLng } from "@/lib/maps";

// Lets a customer drop/drag a pin to mark the service location.
export function MapPicker({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (pos: LatLng, address?: string) => void;
}) {
  if (!GOOGLE_MAPS_KEY) {
    return (
      <div className="rounded-xl bg-warning-light p-4 text-sm text-warning-foreground">
        Map unavailable — set <code>GOOGLE_MAPS_API_KEY</code> in <code>.env.local</code>.
      </div>
    );
  }
  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <PickerInner value={value} onChange={onChange} />
    </APIProvider>
  );
}

function PickerInner({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (pos: LatLng, address?: string) => void;
}) {
  const geocodingLib = useMapsLibrary("geocoding");
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [panTarget, setPanTarget] = useState<LatLng | null>(null);
  const pos = value ?? KARACHI_CENTER;

  useEffect(() => {
    if (geocodingLib) setGeocoder(new geocodingLib.Geocoder());
  }, [geocodingLib]);

  // A job with no lat/lng never shows up on the provider's map — if the
  // customer never drags the pin, fall back to a default location instead of
  // silently saving `null`. Only runs once, and only when nothing is set yet.
  useEffect(() => {
    if (value === null) update(KARACHI_CENTER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: LatLng) {
    if (geocoder) {
      geocoder.geocode({ location: next }, (results, status) => {
        onChange(next, status === "OK" && results?.[0] ? results[0].formatted_address : undefined);
      });
    } else {
      onChange(next);
    }
  }

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const ll = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPanTarget(ll);
        update(ll);
      },
      () => console.warn("Geolocation unavailable — drop the pin manually."),
      { enableHighAccuracy: true }
    );
  }

  return (
    <div className="space-y-2">
      <div className="mapbox" style={{ height: "16rem" }}>
        <MapGate>
          <Map
            defaultCenter={pos}
            defaultZoom={13}
            gestureHandling="greedy"
            disableDefaultUI
            zoomControl
            onClick={(e) => e.detail.latLng && update(e.detail.latLng)}
          >
            <MapController target={panTarget} />
            <Marker
              position={pos}
              draggable
              onDragEnd={(e) => {
                const ll = e.latLng;
                if (ll) update({ lat: ll.lat(), lng: ll.lng() });
              }}
            />
          </Map>
        </MapGate>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Tap the map or drag the pin to set the exact location.</span>
        <button type="button" onClick={useMyLocation} className="font-semibold text-primary">
          📍 Use my location
        </button>
      </div>
    </div>
  );
}
