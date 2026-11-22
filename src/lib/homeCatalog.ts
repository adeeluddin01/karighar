// Homepage ("Our services" grid + "Services & prices") catalog, in the
// shape the web Home renders.
//
// Two sources, one shape:
//
// - The live database (`service_categories` + `services`), the same rows
//   /book already reads. A category card's photo is the category's own
//   `image_url`, falling back to the first service's photo in that
//   category — the per-service version of the rule /book uses — and then
//   to the icon <Shot> draws underneath. So a category shows a real photo
//   whenever any art exists for it, not only when the category row itself
//   has one.
// - The hardcoded CATALOG in lib/catalog.ts, as the fallback when the
//   database is unreachable, has no rows, or Supabase isn't configured
//   at all (the landing page runs without a backend yet). The fallback
//   has no photos — its cards are icon-only, exactly as the Home used to
//   render — but it keeps the page's names and prices instead of an
//   empty grid or an error.
//
// Pure functions, so the mapping is unit-testable without Supabase.

import { CATALOG, type Category as SeedCategory } from "@/lib/catalog";
import { CATEGORY_ICON_WEB } from "@/lib/catalogIcons";
import type { IconName } from "@/components/Icon";
import type { Service, ServiceCategory } from "@/lib/types";

export type HomeService = {
  name: string;
  description: string | null;
  basePrice: number | null;
  unit: string;
};

export type HomeCat = {
  /** Stable key for React + the card link target. */
  key: string;
  name: string;
  icon: IconName;
  /** Card photo, or null for the icon-only fallback <Shot> draws. */
  imageUrl: string | null;
  services: HomeService[];
};

/** The hardcoded catalog, in Home shape. Icon-only: no photos exist. */
export function fallbackHomeCats(): HomeCat[] {
  return CATALOG.map((cat: SeedCategory) => ({
    key: cat.key,
    name: cat.name,
    icon: cat.icon as IconName,
    imageUrl: null,
    services: cat.services.map((s) => ({
      name: s.name,
      description: s.description,
      basePrice: s.basePrice,
      unit: s.unit,
    })),
  }));
}

/**
 * Live database rows -> Home shape. Only active categories with at least
 * one active service are shown, in `sort_order`, mirroring /book and the
 * phone Home. Returns [] when there is nothing live to show, so the
 * caller can keep the fallback instead of rendering an empty page.
 */
export function homeCatsFromDb(
  categories: ServiceCategory[],
  services: Service[]
): HomeCat[] {
  const liveServices = (services ?? []).filter((s) => s.is_active);
  return (categories ?? [])
    .filter((c) => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => {
      const catServices = liveServices.filter((s) => s.category_id === c.id);
      return {
        key: c.id,
        name: c.name,
        icon: (CATEGORY_ICON_WEB[c.icon ?? ""] ?? "wrench") as IconName,
        // Category photo first, then the first service's photo — a
        // category whose own row has no art still shows a real photo
        // when any of its services has one.
        imageUrl:
          c.image_url ?? catServices.find((s) => s.image_url)?.image_url ?? null,
        services: catServices.map((s) => ({
          name: s.name,
          description: s.description,
          basePrice: s.base_price,
          unit: s.unit,
        })),
      };
    })
    .filter((c) => c.services.length > 0);
}
