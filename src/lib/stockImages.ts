/**
 * The stock artwork library — the pictures an admin can pick for a category
 * or a sub-service without uploading anything.
 *
 * WHAT THIS FILE IS: a catalogue of SLOTS, not of files. Each entry names a
 * common home-service job and says where its picture would live
 * (`public/services/<slug>.webp`). That folder may be empty — the picker
 * probes it and offers only the slots that actually resolve, so artwork can
 * be added or swapped by dropping files in, with no code change and no
 * migration. A slot with no file simply doesn't appear in the picker, and a
 * card pointing at a missing file degrades to the category icon the way
 * <Shot> always does.
 *
 * WHY `public/` AND NOT THE `catalog` BUCKET: this set ships with the app
 * and is identical in every deployment, so it versions with the code and
 * costs no round-trip. The bucket stays for the bespoke photo an admin
 * uploads for one particular row (see lib/serviceImage.ts) — that is
 * per-install data, which is a different thing.
 *
 * `icon` is a slot's fallback glyph and MUST be a CATEGORY_ICON_CHOICES
 * slug; stockImages.test.ts fails otherwise, which is what stops this list
 * naming an icon neither lane can draw.
 */

export type StockImage = {
  /** Both the picker's identity and the filename stem. */
  slug: string;
  label: string;
  group: string;
  /** A CATEGORY_ICON_CHOICES slug, drawn when the file is absent. */
  icon: string;
};

/** Where the files live, relative to the site root. */
export const STOCK_IMAGE_DIR = "/services";

/**
 * The one format the library uses.
 *
 * Fixed rather than probed across extensions: the picker tests every slot
 * with a real request, so also accepting `.png` would double that on a
 * screen whose only question is "which of these exist". Any converter turns
 * a PNG into a WebP, and WebP is smaller on the connection most of these
 * cards are loaded over.
 */
export const STOCK_IMAGE_EXT = "webp";

/** `/services/ac-installation.webp` — what gets stored in `image_url`. */
export function stockImageUrl(slug: string): string {
  return `${STOCK_IMAGE_DIR}/${slug}.${STOCK_IMAGE_EXT}`;
}

/**
 * True for a url this library produced.
 *
 * Lets the editor label a pick as "from the library" rather than as an
 * upload, and lets Remove know there is no bucket object behind it.
 */
export function isStockImageUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith(`${STOCK_IMAGE_DIR}/`);
}

/** The slug behind a library url, or null if it isn't one. */
export function stockImageSlug(url: string | null | undefined): string | null {
  if (!isStockImageUrl(url) || !url) return null;
  const file = url.slice(STOCK_IMAGE_DIR.length + 1);
  const dot = file.lastIndexOf(".");
  return dot === -1 ? file : file.slice(0, dot);
}

/**
 * The slots, grouped the way the picker renders them.
 *
 * Chosen for the trades Karighar actually lists in Karachi rather than for
 * a round number — the groups mirror how a customer browses, so an admin
 * adding "Geyser repair" finds it next to "Geyser installation" instead of
 * hunting an alphabetical wall.
 */
export const STOCK_IMAGES: StockImage[] = [
  // ---- Cooling & heating ----
  { slug: "ac-installation", label: "AC installation", group: "Cooling & heating", icon: "ac" },
  { slug: "ac-service", label: "AC general service", group: "Cooling & heating", icon: "ac" },
  { slug: "ac-gas-refill", label: "AC gas refill", group: "Cooling & heating", icon: "ac" },
  { slug: "ac-repair", label: "AC repair", group: "Cooling & heating", icon: "ac" },
  { slug: "ac-dismounting", label: "AC mount / dismount", group: "Cooling & heating", icon: "ac" },
  { slug: "air-cooler-repair", label: "Air cooler repair", group: "Cooling & heating", icon: "ac" },
  { slug: "fan-installation", label: "Fan installation", group: "Cooling & heating", icon: "fan" },
  { slug: "fan-repair", label: "Fan repair", group: "Cooling & heating", icon: "fan" },
  { slug: "exhaust-fan", label: "Exhaust fan", group: "Cooling & heating", icon: "fan" },

  // ---- Electrical ----
  { slug: "house-wiring", label: "House wiring", group: "Electrical", icon: "bolt" },
  { slug: "electrical-repair", label: "Electrical repair", group: "Electrical", icon: "bolt" },
  { slug: "switchboard", label: "Switchboard & sockets", group: "Electrical", icon: "bolt" },
  { slug: "light-installation", label: "Light installation", group: "Electrical", icon: "light" },
  { slug: "chandelier", label: "Chandelier fitting", group: "Electrical", icon: "light" },
  { slug: "ups-installation", label: "UPS installation", group: "Electrical", icon: "bolt" },
  { slug: "generator-service", label: "Generator service", group: "Electrical", icon: "bolt" },
  { slug: "inverter-repair", label: "Inverter repair", group: "Electrical", icon: "bolt" },
  { slug: "distribution-board", label: "Distribution board", group: "Electrical", icon: "bolt" },
  { slug: "earthing", label: "Earthing & safety", group: "Electrical", icon: "bolt" },

  // ---- Plumbing ----
  { slug: "leak-repair", label: "Leak repair", group: "Plumbing", icon: "wrench" },
  { slug: "tap-installation", label: "Tap & fixture install", group: "Plumbing", icon: "wrench" },
  { slug: "pipe-fitting", label: "Pipe fitting", group: "Plumbing", icon: "wrench" },
  { slug: "drain-cleaning", label: "Drain cleaning", group: "Plumbing", icon: "wrench" },
  { slug: "sewerage", label: "Sewerage & blockage", group: "Plumbing", icon: "wrench" },
  { slug: "water-motor", label: "Water motor & pump", group: "Plumbing", icon: "water" },
  { slug: "water-tank-cleaning", label: "Water tank cleaning", group: "Plumbing", icon: "water" },
  { slug: "geyser-installation", label: "Geyser installation", group: "Plumbing", icon: "geyser" },
  { slug: "geyser-repair", label: "Geyser repair", group: "Plumbing", icon: "geyser" },
  { slug: "bathroom-fitting", label: "Bathroom fitting", group: "Plumbing", icon: "bath" },

  // ---- Appliances ----
  { slug: "washing-machine-repair", label: "Washing machine repair", group: "Appliances", icon: "washer" },
  { slug: "fridge-repair", label: "Fridge repair", group: "Appliances", icon: "fridge" },
  { slug: "freezer-repair", label: "Deep freezer repair", group: "Appliances", icon: "fridge" },
  { slug: "microwave-repair", label: "Microwave repair", group: "Appliances", icon: "washer" },
  { slug: "oven-repair", label: "Oven & stove repair", group: "Appliances", icon: "chef" },
  { slug: "dishwasher-repair", label: "Dishwasher repair", group: "Appliances", icon: "washer" },
  { slug: "water-dispenser", label: "Water dispenser", group: "Appliances", icon: "water" },
  { slug: "tv-repair", label: "TV repair", group: "Appliances", icon: "tv" },
  { slug: "tv-mounting", label: "TV wall mounting", group: "Appliances", icon: "tv" },
  { slug: "dish-antenna", label: "Dish antenna", group: "Appliances", icon: "tv" },
  { slug: "vacuum-repair", label: "Vacuum cleaner repair", group: "Appliances", icon: "cleaning" },
  { slug: "sewing-machine", label: "Sewing machine repair", group: "Appliances", icon: "washer" },

  // ---- Cleaning ----
  { slug: "home-deep-clean", label: "Home deep cleaning", group: "Cleaning", icon: "cleaning" },
  { slug: "kitchen-cleaning", label: "Kitchen deep clean", group: "Cleaning", icon: "cleaning" },
  { slug: "bathroom-cleaning", label: "Bathroom deep clean", group: "Cleaning", icon: "cleaning" },
  { slug: "sofa-cleaning", label: "Sofa shampooing", group: "Cleaning", icon: "cleaning" },
  { slug: "carpet-cleaning", label: "Carpet cleaning", group: "Cleaning", icon: "cleaning" },
  { slug: "curtain-cleaning", label: "Curtain cleaning", group: "Cleaning", icon: "cleaning" },
  { slug: "window-cleaning", label: "Window & glass cleaning", group: "Cleaning", icon: "cleaning" },
  { slug: "post-construction-clean", label: "Post-construction clean", group: "Cleaning", icon: "cleaning" },
  { slug: "office-cleaning", label: "Office cleaning", group: "Cleaning", icon: "cleaning" },
  { slug: "marble-polishing", label: "Marble polishing", group: "Cleaning", icon: "tiles" },

  // ---- Pest & sanitation ----
  { slug: "fumigation", label: "Fumigation", group: "Pest & sanitation", icon: "pest" },
  { slug: "termite-control", label: "Termite control", group: "Pest & sanitation", icon: "pest" },
  { slug: "cockroach-control", label: "Cockroach control", group: "Pest & sanitation", icon: "pest" },
  { slug: "rodent-control", label: "Rodent control", group: "Pest & sanitation", icon: "pest" },
  { slug: "mosquito-spray", label: "Mosquito spray", group: "Pest & sanitation", icon: "pest" },
  { slug: "bed-bug-treatment", label: "Bed bug treatment", group: "Pest & sanitation", icon: "pest" },

  // ---- Carpentry & furniture ----
  { slug: "carpentry", label: "General carpentry", group: "Carpentry & furniture", icon: "carpenter" },
  { slug: "door-repair", label: "Door repair", group: "Carpentry & furniture", icon: "carpenter" },
  { slug: "lock-installation", label: "Lock installation", group: "Carpentry & furniture", icon: "locksmith" },
  { slug: "furniture-assembly", label: "Furniture assembly", group: "Carpentry & furniture", icon: "furniture" },
  { slug: "furniture-repair", label: "Furniture repair", group: "Carpentry & furniture", icon: "furniture" },
  { slug: "upholstery", label: "Upholstery", group: "Carpentry & furniture", icon: "furniture" },
  { slug: "wardrobe", label: "Wardrobe & closet", group: "Carpentry & furniture", icon: "furniture" },
  { slug: "kitchen-cabinet", label: "Kitchen cabinets", group: "Carpentry & furniture", icon: "furniture" },
  { slug: "curtain-rod", label: "Curtain rod fitting", group: "Carpentry & furniture", icon: "carpenter" },

  // ---- Painting & finishing ----
  { slug: "wall-painting", label: "Wall painting", group: "Painting & finishing", icon: "painter" },
  { slug: "exterior-painting", label: "Exterior painting", group: "Painting & finishing", icon: "painter" },
  { slug: "wallpaper", label: "Wallpaper", group: "Painting & finishing", icon: "interior" },
  { slug: "false-ceiling", label: "False ceiling", group: "Painting & finishing", icon: "interior" },
  { slug: "pop-work", label: "POP & cornice", group: "Painting & finishing", icon: "interior" },
  { slug: "wood-polish", label: "Wood polishing", group: "Painting & finishing", icon: "carpenter" },
  { slug: "waterproofing", label: "Waterproofing", group: "Painting & finishing", icon: "masonry" },
  { slug: "texture-paint", label: "Texture & stencil", group: "Painting & finishing", icon: "painter" },

  // ---- Construction & masonry ----
  { slug: "masonry", label: "Masonry work", group: "Construction & masonry", icon: "masonry" },
  { slug: "tile-installation", label: "Tile installation", group: "Construction & masonry", icon: "tiles" },
  { slug: "marble-installation", label: "Marble & granite", group: "Construction & masonry", icon: "tiles" },
  { slug: "flooring", label: "Flooring", group: "Construction & masonry", icon: "tiles" },
  { slug: "plastering", label: "Plastering", group: "Construction & masonry", icon: "masonry" },
  { slug: "roof-repair", label: "Roof repair", group: "Construction & masonry", icon: "masonry" },
  { slug: "grill-welding", label: "Grill & welding", group: "Construction & masonry", icon: "masonry" },
  { slug: "glass-aluminium", label: "Glass & aluminium", group: "Construction & masonry", icon: "masonry" },

  // ---- Security & tech ----
  { slug: "cctv-installation", label: "CCTV installation", group: "Security & tech", icon: "camera" },
  { slug: "cctv-repair", label: "CCTV repair", group: "Security & tech", icon: "camera" },
  { slug: "intercom", label: "Intercom & doorbell", group: "Security & tech", icon: "camera" },
  { slug: "smart-lock", label: "Smart lock", group: "Security & tech", icon: "smart" },
  { slug: "alarm-system", label: "Alarm system", group: "Security & tech", icon: "camera" },
  { slug: "wifi-setup", label: "WiFi setup", group: "Security & tech", icon: "internet" },
  { slug: "networking", label: "Networking & cabling", group: "Security & tech", icon: "internet" },
  { slug: "computer-repair", label: "Computer repair", group: "Security & tech", icon: "internet" },
  { slug: "smart-home", label: "Smart home automation", group: "Security & tech", icon: "smart" },

  // ---- Solar & energy ----
  { slug: "solar-installation", label: "Solar installation", group: "Solar & energy", icon: "solar" },
  { slug: "solar-cleaning", label: "Solar panel cleaning", group: "Solar & energy", icon: "solar" },
  { slug: "solar-repair", label: "Solar repair", group: "Solar & energy", icon: "solar" },
  { slug: "battery-service", label: "Battery service", group: "Solar & energy", icon: "bolt" },
  { slug: "gas-line", label: "Gas line & fitting", group: "Solar & energy", icon: "geyser" },

  // ---- Outdoor & garden ----
  { slug: "gardening", label: "Gardening", group: "Outdoor & garden", icon: "garden" },
  { slug: "lawn-mowing", label: "Lawn mowing", group: "Outdoor & garden", icon: "garden" },
  { slug: "tree-cutting", label: "Tree cutting", group: "Outdoor & garden", icon: "garden" },
  { slug: "plant-care", label: "Plant care", group: "Outdoor & garden", icon: "garden" },
  { slug: "outdoor-lighting", label: "Outdoor lighting", group: "Outdoor & garden", icon: "light" },
  { slug: "driveway-cleaning", label: "Driveway & porch wash", group: "Outdoor & garden", icon: "cleaning" },

  // ---- Moving & logistics ----
  { slug: "house-shifting", label: "House shifting", group: "Moving & logistics", icon: "movers" },
  { slug: "office-shifting", label: "Office shifting", group: "Moving & logistics", icon: "movers" },
  { slug: "packing", label: "Packing service", group: "Moving & logistics", icon: "movers" },
  { slug: "loading-unloading", label: "Loading & unloading", group: "Moving & logistics", icon: "movers" },

  // ---- Vehicle ----
  { slug: "car-wash", label: "Car wash", group: "Vehicle", icon: "auto" },
  { slug: "car-detailing", label: "Car detailing", group: "Vehicle", icon: "auto" },
  { slug: "car-ac-service", label: "Car AC service", group: "Vehicle", icon: "auto" },
  { slug: "bike-service", label: "Bike service", group: "Vehicle", icon: "auto" },
  { slug: "battery-jumpstart", label: "Battery jumpstart", group: "Vehicle", icon: "auto" },

  // ---- Home & personal ----
  { slug: "laundry", label: "Laundry", group: "Home & personal", icon: "laundry" },
  { slug: "dry-cleaning", label: "Dry cleaning", group: "Home & personal", icon: "laundry" },
  { slug: "ironing", label: "Ironing", group: "Home & personal", icon: "laundry" },
  { slug: "cooking", label: "Cooking & catering", group: "Home & personal", icon: "chef" },
  { slug: "pet-grooming", label: "Pet grooming", group: "Home & personal", icon: "pet" },
  { slug: "elderly-care", label: "Elderly care", group: "Home & personal", icon: "health" },
  { slug: "home-tutoring", label: "Home tutoring", group: "Home & personal", icon: "tutor" },
];

/** Group names in catalogue order, for the picker's headings. */
export const STOCK_IMAGE_GROUPS: string[] = [...new Set(STOCK_IMAGES.map((s) => s.group))];
