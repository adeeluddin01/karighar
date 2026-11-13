import type { SupabaseClient } from "@supabase/supabase-js";
import { withCacheBust } from "@/lib/avatar";

/**
 * Catalog photos — the art on the service cards.
 *
 * Deliberately a sibling of `avatar.ts` rather than a generalisation of it,
 * for the reason verificationDoc.ts spells out: the two uploads share a
 * shape but not a domain. An avatar is owned by the account that uploads
 * it, is capped small because it renders at 46px, and is keyed on a uid. A
 * catalog photo is owned by the platform, fills a card, and is keyed on the
 * catalog row. Folding them together would mean a function with a `kind`
 * parameter branching on all three.
 *
 * `withCacheBust` IS shared, because it is already generic and it is the
 * one line that must not drift — see its comment in avatar.ts.
 */

/** The public bucket from patch_v33. Never `verification` — that one is private. */
export const CATALOG_BUCKET = "catalog";

/**
 * Bigger than an avatar's 2MB: this fills a card panel, so a 2x source for
 * a ~320px-wide desktop card is around 640x480. Still small enough that the
 * card is not the reason /book is slow on 3G.
 */
export const CATALOG_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** What the file input should offer, kept next to the check that enforces it. */
export const CATALOG_IMAGE_ACCEPT = ALLOWED.join(",");

/** Which catalog table the photo belongs to. */
export type CatalogImageKind = "service" | "category";

/** `catalog/services/…` or `catalog/categories/…` — human browsability only. */
const FOLDER: Record<CatalogImageKind, string> = {
  service: "services",
  category: "categories",
};

/**
 * Why the file can't be used, or null if it can.
 *
 * A sentence to show the admin rather than a code: both rejections are
 * things the person can fix themselves, before anything is uploaded.
 */
export function validateServiceImage(file: { type: string; size: number }): string | null {
  if (!ALLOWED.includes(file.type)) {
    // image/heic is the specific one worth catching: it is what an iPhone
    // produces by default and no browser can decode it, so accepting it
    // would store a photo that renders as nothing.
    return "Pick a JPG, PNG or WebP photo.";
  }
  if (file.size > CATALOG_IMAGE_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `That photo is ${mb}MB. Pick one under 3MB.`;
  }
  return null;
}

/** `jpeg` for a JPEG, and so on — the extension the bucket object gets. */
export function serviceImageExt(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Where a catalog row's photo lives: one object per row, overwritten in place.
 *
 * Keyed on the ROW, not the admin who uploaded it — the catalog is one
 * platform-owned resource, so scoping it per uploader would scatter a single
 * category's art across however many admins had touched it.
 *
 * Deterministic rather than timestamped, for the same reason as `avatarPath`:
 * there is no cleanup job, so a fresh key per upload would leave every
 * previous photo behind in the bucket. The admin's own filename never
 * travels.
 */
export function serviceImagePath(
  kind: CatalogImageKind,
  rowId: string,
  type: string
): string {
  return `${FOLDER[kind]}/${rowId}.${serviceImageExt(type)}`;
}

export type ServiceImageUpload = { url: string; error: null } | { url: null; error: string };

/**
 * Put the photo in the bucket and hand back the URL to store on the row.
 *
 * Does NOT write `image_url` itself — the caller does, because it is the
 * one that knows whether this is a service or a category and has just
 * written the rest of the row.
 */
export async function uploadServiceImage(
  supabase: SupabaseClient,
  kind: CatalogImageKind,
  rowId: string,
  file: File
): Promise<ServiceImageUpload> {
  const bad = validateServiceImage(file);
  if (bad) return { url: null, error: bad };

  const ext = serviceImageExt(file.type);
  const path = serviceImagePath(kind, rowId, file.type);

  const { error } = await supabase.storage
    .from(CATALOG_BUCKET)
    // upsert, so a replacement overwrites rather than failing with
    // "resource already exists".
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    // The most likely cause on a database that hasn't run patch_v33, and
    // the one error message that would otherwise be baffling.
    const missing = /bucket/i.test(error.message) && /not found|does not exist/i.test(error.message);
    return {
      url: null,
      error: missing
        ? "Catalog photo storage isn't set up yet. Run supabase/patch_v33_service_images.sql."
        : error.message,
    };
  }

  // Upsert only replaces the SAME key, so swapping a JPG for a PNG would
  // otherwise leave the old object orphaned forever. Best-effort: the row's
  // image_url already points at the new object, so a failure here costs a
  // few stale KB, not correctness.
  const stale = ALLOWED.map(serviceImageExt)
    .filter((e) => e !== ext)
    .map((e) => `${FOLDER[kind]}/${rowId}.${e}`);
  await supabase.storage.from(CATALOG_BUCKET).remove(stale);

  const {
    data: { publicUrl },
  } = supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path);

  // The ?v= is load-bearing: `serviceImagePath` is deterministic, so without
  // it both the browser cache and Supabase's CDN keep serving the previous
  // photo and a replacement looks like it silently failed.
  return { url: withCacheBust(publicUrl), error: null };
}
