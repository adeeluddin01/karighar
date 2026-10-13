import { describe, expect, it } from "vitest";
import { googleDirectionsUrl } from "./maps";

const q = (url: string) => new URLSearchParams(url.split("?")[1]);

describe("googleDirectionsUrl", () => {
  it("routes to a coordinate pin", () => {
    const url = googleDirectionsUrl({ lat: 24.86, lng: 67.01 });
    expect(url.startsWith("https://www.google.com/maps/dir/?")).toBe(true);
    expect(q(url).get("destination")).toBe("24.86,67.01");
    expect(q(url).get("travelmode")).toBe("driving");
    expect(q(url).get("api")).toBe("1");
  });

  it("omits origin by default, so Google routes from the device", () => {
    expect(q(googleDirectionsUrl({ lat: 1, lng: 2 })).has("origin")).toBe(false);
  });

  it("includes an explicit origin when given one", () => {
    const url = googleDirectionsUrl({ lat: 1, lng: 2 }, { origin: { lat: 3, lng: 4 } });
    expect(q(url).get("origin")).toBe("3,4");
  });

  // A job with no pin must still get *directions*, not a map search.
  it("falls back to the address on the directions endpoint", () => {
    const url = googleDirectionsUrl(null, { address: "House 12, Gulshan, Karachi" });
    expect(url).toContain("/maps/dir/");
    expect(url).not.toContain("/maps/search/");
    expect(q(url).get("destination")).toBe("House 12, Gulshan, Karachi");
  });

  it("prefers coordinates over the address when both are present", () => {
    const url = googleDirectionsUrl({ lat: 5, lng: 6 }, { address: "somewhere" });
    expect(q(url).get("destination")).toBe("5,6");
  });

  it("returns an empty string when there is nothing to route to", () => {
    expect(googleDirectionsUrl(null)).toBe("");
    expect(googleDirectionsUrl(undefined)).toBe("");
    expect(googleDirectionsUrl(null, { address: "   " })).toBe("");
    expect(googleDirectionsUrl(null, { address: null })).toBe("");
  });
});
