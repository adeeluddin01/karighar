// `service_categories.icon` holds a short slug, not an icon name. Each lane
// maps it onto its own icon set — Lucide on the web, the `.kg` sprite on the
// phone — so a slug is only usable if BOTH maps know it. An unknown slug
// silently renders a wrench, which is why /admin/catalog offers this list
// instead of a free-text field.
//
// Both maps live here, in a pure module, so catalogIcons.test.ts can prove
// every offered slug actually resolves on both lanes. Adding a category icon
// means adding one row to each map below and one to CATEGORY_ICON_CHOICES;
// the test fails until all three agree.

/** Slugs offered in the admin picker, with the label shown beside them. */
export const CATEGORY_ICON_CHOICES: { slug: string; label: string }[] = [
  { slug: "ac", label: "Air conditioning" },
  { slug: "bolt", label: "Electrical" },
  { slug: "wrench", label: "Plumbing / general" },
  { slug: "carpenter", label: "Carpentry" },
  { slug: "painter", label: "Painting" },
  { slug: "solar", label: "Solar / cleaning" },
  { slug: "camera", label: "Cameras & security" },
  { slug: "washer", label: "Appliances" },
];

/** Web lane: slug -> Lucide icon name (see components/Icon.tsx). */
export const CATEGORY_ICON_WEB: Record<string, string> = {
  ac: "snowflake",
  bolt: "zap",
  wrench: "wrench",
  carpenter: "hammer",
  painter: "paintbrush",
  solar: "sun",
  camera: "camera",
  washer: "washingmachine",
};

/**
 * Phone lane: slug -> `.kg` sprite name. Carries a few extra aliases the
 * seed data never used but which read naturally, so a hand-edited row still
 * resolves.
 */
export const CATEGORY_ICON_PHONE: Record<string, string> = {
  ac: "snow",
  snowflake: "snow",
  bolt: "zap",
  zap: "zap",
  wrench: "wrench",
  plumber: "wrench",
  hammer: "hammer",
  carpenter: "hammer",
  brush: "brush",
  painter: "brush",
  spark: "spark",
  cleaning: "spark",
  solar: "spark",
  camera: "camera",
  washer: "gear",
};

/** The fallback both lanes use for an unrecognised slug. */
export const CATEGORY_ICON_FALLBACK = "wrench";
