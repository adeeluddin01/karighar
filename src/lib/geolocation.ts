/* ============================================================
   Human copy for the ways `navigator.geolocation` can fail.

   Split out of the map hooks so it is a plain module with no React in it:
   vitest here is node-env and only collects .test.ts files under src, so
   anything living inside a hook or a .tsx page cannot be tested at all.

   The wording differs by what the user was trying to do. Telling someone
   whose GPS is switched off that "in-app directions need the Directions API
   enabled" sends them to the wrong place entirely.
   ============================================================ */

/** What the user was trying to do when location was needed. */
export type GeoIntent = "route" | "locate";

/** `GeolocationPositionError` codes, which are numbers at runtime. */
export const GEO_PERMISSION_DENIED = 1;
export const GEO_POSITION_UNAVAILABLE = 2;
export const GEO_TIMEOUT = 3;

/** The browser has no geolocation at all (old browser, or an insecure origin). */
export function geolocationUnsupportedMessage(intent: GeoIntent): string {
  return intent === "route"
    ? "This browser can't share your location, so in-app directions aren't available. You can still open the route in Google Maps."
    : "This browser can't share your location.";
}

/**
 * Copy for a failed `getCurrentPosition`.
 *
 * `code` is whatever the callback received — it may be undefined if something
 * other than a GeolocationPositionError comes through, so treat anything
 * unrecognised as a generic failure rather than guessing "denied".
 */
export function geolocationErrorMessage(code: number | undefined, intent: GeoIntent): string {
  switch (code) {
    case GEO_PERMISSION_DENIED:
      return intent === "route"
        ? "Location permission denied — allow it, or open the route in Google Maps."
        : "Location permission denied. Allow it in your browser settings to see where you are.";
    case GEO_TIMEOUT:
      return "Couldn't get a location fix in time. Try again, ideally outdoors.";
    case GEO_POSITION_UNAVAILABLE:
      return "Your location isn't available right now. Check that GPS or location services are on.";
    default:
      return intent === "route"
        ? "Couldn't get your location — open the route in Google Maps instead."
        : "Couldn't get your location. Try again.";
  }
}
