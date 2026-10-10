import type { KIconName } from "@/components/kg/icons";

// `service_categories.icon` holds a short slug (see supabase/schema.sql seed
// data). Map it onto the redesign's icon set, with a wrench as the fallback
// for a category added later without a known slug.
const BY_SLUG: Record<string, KIconName> = {
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
};

export function categoryIcon(slug?: string | null): KIconName {
  if (!slug) return "wrench";
  return BY_SLUG[slug.toLowerCase()] ?? "wrench";
}
