import { describe, expect, it } from "vitest";
import {
  GEO_PERMISSION_DENIED,
  GEO_POSITION_UNAVAILABLE,
  GEO_TIMEOUT,
  geolocationErrorMessage,
  geolocationUnsupportedMessage,
  type GeoIntent,
} from "./geolocation";

const INTENTS: GeoIntent[] = ["route", "locate"];

describe("geolocationErrorMessage", () => {
  it("names the permission as the problem when it was denied", () => {
    for (const intent of INTENTS) {
      expect(geolocationErrorMessage(GEO_PERMISSION_DENIED, intent)).toMatch(/permission denied/i);
    }
  });

  it("distinguishes a timeout from a denial", () => {
    const msg = geolocationErrorMessage(GEO_TIMEOUT, "locate");
    expect(msg).toMatch(/in time|again/i);
    expect(msg).not.toMatch(/permission/i);
  });

  it("points at GPS when the position is simply unavailable", () => {
    const msg = geolocationErrorMessage(GEO_POSITION_UNAVAILABLE, "locate");
    expect(msg).toMatch(/GPS|location services/i);
    expect(msg).not.toMatch(/permission/i);
  });

  // The callback may hand back something that isn't a GeolocationPositionError;
  // guessing "denied" there would send the user to the wrong settings screen.
  it("does not claim a denial for an unrecognised or missing code", () => {
    for (const code of [undefined, 0, 99, -1]) {
      for (const intent of INTENTS) {
        expect(geolocationErrorMessage(code, intent)).not.toMatch(/permission/i);
      }
    }
  });

  // The whole point of the intent split: a GPS failure must not read as
  // "the Directions API is off".
  it("offers Google Maps as a way out when routing, but not when merely locating", () => {
    expect(geolocationErrorMessage(GEO_PERMISSION_DENIED, "route")).toMatch(/google maps/i);
    expect(geolocationErrorMessage(GEO_PERMISSION_DENIED, "locate")).not.toMatch(/google maps/i);
  });

  it("never mentions the Directions API — that is a different failure", () => {
    for (const code of [GEO_PERMISSION_DENIED, GEO_TIMEOUT, GEO_POSITION_UNAVAILABLE, undefined]) {
      for (const intent of INTENTS) {
        expect(geolocationErrorMessage(code, intent)).not.toMatch(/directions api/i);
      }
    }
  });

  it("always returns something non-empty", () => {
    for (const code of [1, 2, 3, undefined, 42]) {
      for (const intent of INTENTS) {
        expect(geolocationErrorMessage(code, intent).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("geolocationUnsupportedMessage", () => {
  it("explains the browser cannot do it at all, for either intent", () => {
    for (const intent of INTENTS) {
      expect(geolocationUnsupportedMessage(intent)).toMatch(/can't share your location/i);
    }
  });

  it("still offers Google Maps when the user wanted a route", () => {
    expect(geolocationUnsupportedMessage("route")).toMatch(/google maps/i);
  });
});
