import { describe, it, expect } from "vitest";
import { CATEGORY_GLYPH, businessPin } from "./mapGlyphs";
import { CATEGORY_ICON_CHOICES, CATEGORY_ICON_FALLBACK } from "./catalogIcons";

/* The marker glyphs are a THIRD copy of the icon set — the web lane has
   Lucide names, the phone lane has sprite ids, and a data-URI marker can use
   neither, so it carries the path data itself. Same contract as
   catalogIcons.test.ts: a slug the admin can pick must resolve here too, or
   every business in that trade quietly gets a wrench on the map. */
describe("category glyphs", () => {
  it("draws every slug the admin catalogue offers", () => {
    for (const { slug, label } of CATEGORY_ICON_CHOICES) {
      expect(CATEGORY_GLYPH[slug], `${label} (${slug}) has no marker glyph`).toBeTruthy();
    }
  });

  it("offers no glyph the catalogue cannot produce", () => {
    const offered = new Set(CATEGORY_ICON_CHOICES.map((c) => c.slug));
    for (const slug of Object.keys(CATEGORY_GLYPH)) {
      expect(offered.has(slug), `${slug} is drawn but can never be selected`).toBe(true);
    }
  });

  it("keeps the fallback drawable", () => {
    expect(CATEGORY_GLYPH[CATEGORY_ICON_FALLBACK]).toBeTruthy();
  });

  // Stroke-only on a 24x24 grid is what lets one wrapper <g> draw them all;
  // a filled path would come out as a white blob inside the pin.
  it("uses stroke-only markup", () => {
    for (const [slug, markup] of Object.entries(CATEGORY_GLYPH)) {
      expect(markup, `${slug} sets its own fill`).not.toContain("fill=");
      expect(markup, `${slug} sets its own stroke`).not.toContain("stroke=");
    }
  });
});

describe("businessPin", () => {
  it("builds a self-contained data URI with no sprite reference", () => {
    const uri = businessPin("ac");
    expect(uri.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml;utf8,".length));
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // A <use> would resolve against the host document, which a data URI has
    // none of — this is the mistake the duplicated glyphs exist to avoid.
    expect(svg).not.toContain("<use");
  });

  it("falls back to the wrench for an unknown or missing slug", () => {
    const fallback = businessPin(CATEGORY_ICON_FALLBACK);
    expect(businessPin(null)).toBe(fallback);
    expect(businessPin(undefined)).toBe(fallback);
    expect(businessPin("not-a-real-trade")).toBe(fallback);
  });

  it("distinguishes a highlighted pin from a resting one", () => {
    expect(businessPin("ac", true)).not.toBe(businessPin("ac", false));
  });
});
