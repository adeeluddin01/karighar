import { describe, expect, it } from "vitest";
import {
  CATEGORY_ICON_CHOICES,
  CATEGORY_ICON_FALLBACK,
  CATEGORY_ICON_PHONE,
  CATEGORY_ICON_WEB,
} from "./catalogIcons";

/* The failure this guards against is silent: an admin picks an icon for a new
   category, it renders on the screen they happened to check, and falls back
   to a wrench on the other lane. Nothing errors, so nobody finds out. */
describe("category icon slugs", () => {
  it("offers only slugs that resolve on BOTH lanes", () => {
    for (const { slug } of CATEGORY_ICON_CHOICES) {
      expect(CATEGORY_ICON_WEB[slug], `${slug} is missing from the web map`).toBeTruthy();
      expect(CATEGORY_ICON_PHONE[slug], `${slug} is missing from the phone map`).toBeTruthy();
    }
  });

  it("offers every slug the web lane can draw, so none is unreachable", () => {
    const offered = new Set(CATEGORY_ICON_CHOICES.map((c) => c.slug));
    for (const slug of Object.keys(CATEGORY_ICON_WEB)) {
      expect(offered.has(slug), `${slug} renders but is not offered in the picker`).toBe(true);
    }
  });

  it("has a unique slug and a label for every choice", () => {
    const slugs = CATEGORY_ICON_CHOICES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CATEGORY_ICON_CHOICES) expect(c.label.trim()).not.toBe("");
  });

  it("falls back to a slug both lanes actually know", () => {
    expect(CATEGORY_ICON_WEB[CATEGORY_ICON_FALLBACK]).toBeTruthy();
    expect(CATEGORY_ICON_PHONE[CATEGORY_ICON_FALLBACK]).toBeTruthy();
  });

  it("keeps the seeded slugs working — these are live rows in every database", () => {
    // supabase/schema.sql seeds exactly these.
    for (const slug of ["ac", "bolt", "wrench", "carpenter", "painter", "solar", "camera", "washer"]) {
      expect(CATEGORY_ICON_WEB[slug], `seeded slug ${slug} lost its web icon`).toBeTruthy();
      expect(CATEGORY_ICON_PHONE[slug], `seeded slug ${slug} lost its phone icon`).toBeTruthy();
    }
  });
});
