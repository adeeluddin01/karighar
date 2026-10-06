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
