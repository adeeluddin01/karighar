export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Karachi city centre — default map focus.
export const KARACHI_CENTER = { lat: 24.8607, lng: 67.0011 };

export type LatLng = { lat: number; lng: number };

// A decluttered "just the roads" style for maps a technician actually
// navigates by: no POI icons, no building footprints/parcels, no transit —
// street names and the road network stay, so the route reads clearly at a
// glance instead of competing with shop pins and building outlines.
export const NAV_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape.man_made", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
];

// Stripped further still, for the provider's jobs map: every point-of-interest
// icon, label and transit marker is gone, so at any zoom the only things on
// the map are the road network and the job dots. Street names stay — a
// technician still has to navigate by them.
export const BARE_MAP_STYLE: google.maps.MapTypeStyle[] = [
  ...NAV_MAP_STYLE,
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.arterial", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
];

/**
 * Deep link to turn-by-turn directions in Google Maps — the native app on a
 * phone, the website on desktop. `destination` is a coordinate so it lands on
 * the exact pin rather than a geocoded guess at the address.
 */
export function googleDirectionsUrl({ lat, lng }: LatLng) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
