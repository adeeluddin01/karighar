import type { KIconName } from "@/components/kg/icons";
import {
  CATEGORY_ICON_FALLBACK,
  CATEGORY_ICON_PHONE,
} from "@/lib/catalogIcons";

// `service_categories.icon` holds a short slug (see supabase/schema.sql seed
// data). The slug -> icon tables now live in lib/catalogIcons.ts next to the
// web lane's map and the list /admin/catalog offers, so an icon an admin can
// pick is provably one both lanes can draw. This stays as the phone lane's
// typed accessor.
export function categoryIcon(slug?: string | null): KIconName {
  if (!slug) return CATEGORY_ICON_FALLBACK as KIconName;
  return (CATEGORY_ICON_PHONE[slug.toLowerCase()] ?? CATEGORY_ICON_FALLBACK) as KIconName;
}
