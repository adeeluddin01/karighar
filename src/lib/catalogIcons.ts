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

  // ---- added for a broader catalogue ----
  { slug: "cleaning", label: "Cleaning & housekeeping" },
  { slug: "pest", label: "Pest control" },
  { slug: "fridge", label: "Fridge & freezer" },
  { slug: "water", label: "Water tank & supply" },
  { slug: "geyser", label: "Geyser & gas" },
  { slug: "locksmith", label: "Locks & keys" },
  { slug: "movers", label: "Movers & packers" },
  { slug: "garden", label: "Gardening & landscaping" },
  { slug: "internet", label: "Internet & networking" },
  { slug: "tv", label: "TV & dish mounting" },
  { slug: "tiles", label: "Tiles & flooring" },
  { slug: "fan", label: "Fans & ventilation" },
  { slug: "bath", label: "Bathroom fitting" },
  { slug: "light", label: "Lighting" },
  { slug: "furniture", label: "Furniture & upholstery" },
  { slug: "masonry", label: "Masonry & renovation" },
  { slug: "laundry", label: "Laundry & dry cleaning" },
  { slug: "auto", label: "Car wash & auto care" },
  { slug: "smart", label: "Smart home automation" },
  { slug: "interior", label: "Interior design" },
  { slug: "pet", label: "Pet grooming" },
  { slug: "chef", label: "Cooking & catering" },
  { slug: "health", label: "Home healthcare" },
  { slug: "tutor", label: "Home tutoring" },
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

  cleaning: "sparkles",
  pest: "bug",
  fridge: "refrigerator",
  water: "droplets",
  geyser: "flame",
  locksmith: "key",
  movers: "truck",
  garden: "sprout",
  internet: "wifi",
  tv: "tv",
  tiles: "grid",
  fan: "fan",
  bath: "shower",
  light: "bulb",
  furniture: "sofa",
  masonry: "construction",
  laundry: "shirt",
  auto: "car",
  smart: "cpu",
  interior: "ruler",
  pet: "dog",
  chef: "utensils",
  health: "stethoscope",
  tutor: "graduation",
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

  // Several reuse an existing sprite where one already reads right:
  // `cleaning` is already aliased to `spark` above, and geyser borrows
  // `flame`. Drawing a near-duplicate would add a glyph to maintain for no
  // visible difference.
  pest: "bug",
  fridge: "fridge",
  water: "droplets",
  geyser: "flame",
  locksmith: "key",
  movers: "truck",
  garden: "sprout",
  internet: "wifi",
  tv: "tv",
  tiles: "tiles",
  fan: "fan",
  bath: "shower",
  light: "bulb",
  furniture: "sofa",
  masonry: "brick",
  laundry: "shirt",
  auto: "car",
  smart: "cpu",
  interior: "ruler",
  pet: "dog",
  chef: "utensils",
  health: "stethoscope",
  tutor: "graduation",
};

/** The fallback both lanes use for an unrecognised slug. */
export const CATEGORY_ICON_FALLBACK = "wrench";
