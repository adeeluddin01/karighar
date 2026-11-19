import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_BUCKET } from "@/lib/serviceImage";
import { STOCK_IMAGES, isStockImageUrl, stockImageUrl } from "@/lib/stockImages";

/**
 * The picture library, as the catalog editor actually needs it.
 *
 * TWO SOURCES, ONE LIST. The bundled artwork in `public/services/` ships
 * with the app and is identical everywhere; the `catalog` bucket holds the
 * photos THIS install's admins uploaded. Before this module only the first
 * was listed, which is why an admin who had uploaded art to three categories
 * opened "Choose from library" and was told the library was empty — their own
 * photos were never candidates, and could not be reused on another row
 * without uploading the same file again.
 *
 * Uploads come first in the picker: on a real install they are the ones an
 * admin recognises, and `public/services/` is empty on a stock checkout.
 */

/** One offerable picture. `url` is exactly what goes in `image_url`. */
export type LibraryImage = {
  url: string;
  label: string;
  /** Fallback glyph slug while the picture loads, or if it 404s. */
  icon: string | null;
};

export type LibraryGroup = { name: string; items: LibraryImage[] };

/**
 * Compare two `image_url`s ignoring the `?v=` cache-bust.
 *
 * Load-bearing for the picker's selected state: `uploadServiceImage` stores
 * a URL stamped with `Date.now()`, while a listing builds the same object's
 * URL from its `updated_at`. Comparing the raw strings would mean a row's
 * own photo never showed as the one that is on.
 */
export function sameImage(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.split("?")[0] === b.split("?")[0];
}

/** A catalog row, as far as labelling an upload is concerned. */
type NamedRow = { id: string; name: string; icon?: string | null };

/**
 * Every bundled slot that actually has a file behind it.
 *
 * There is no directory listing to ask — this is a static export, so
 * `public/` is just files on a CDN — so each slot is probed with a real
 * image load. Memoised at module scope: the answer cannot change within a
 * page load, and this is what keeps it from being ~120 requests every time a
 * modal opens rather than once per visit.
 */
let bundledProbe: Promise<Set<string>> | null = null;

export function availableStockImages(): Promise<Set<string>> {
  if (bundledProbe) return bundledProbe;
  bundledProbe = Promise.all(
    STOCK_IMAGES.map(
      (s) =>
        new Promise<string | null>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve(s.slug);
          img.onerror = () => resolve(null);
          img.src = stockImageUrl(s.slug);
        })
    )
  ).then((found) => new Set(found.filter((s): s is string => s !== null)));
  return bundledProbe;
}

/**
 * The photos this install's admins have uploaded, newest first.
 *
 * Objects are keyed on the ROW they were uploaded for
 * (`services/<uuid>.jpg` — see `serviceImagePath`), so the filename is a
 * uuid and useless as a label. The rows are passed in to turn it back into
 * "AC installation". An object whose row has since been deleted is still
 * offered, labelled by its folder: the picture is perfectly good art, and
 * silently dropping it would strand it in a bucket with no cleanup job.
 */
export async function fetchCatalogUploads(
  supabase: SupabaseClient,
  cats: NamedRow[],
  services: NamedRow[]
): Promise<{ images: LibraryImage[]; error: string | null }> {
  const folders: { folder: string; rows: NamedRow[]; kind: string }[] = [
    { folder: "categories", rows: cats, kind: "Service" },
    { folder: "services", rows: services, kind: "Sub-service" },
  ];

  const images: LibraryImage[] = [];
  let failure: string | null = null;

  for (const { folder, rows, kind } of folders) {
    const { data, error } = await supabase.storage
      .from(CATALOG_BUCKET)
      .list(folder, { limit: 200, sortBy: { column: "updated_at", order: "desc" } });

    if (error) {
      // A missing bucket means patch_v33 has not run. Worth saying once
      // rather than per folder, and worth distinguishing from "empty".
      failure = /not found|does not exist|bucket/i.test(error.message)
        ? "Catalog photo storage isn't set up yet. Run supabase/patch_v33_service_images.sql."
        : error.message;
      continue;
    }

    for (const obj of data ?? []) {
      // `.emptyFolderPlaceholder` is Supabase's own marker object; it is not
      // a picture and has no extension to strip.
      if (!obj.name || obj.name.startsWith(".")) continue;
      const rowId = obj.name.replace(/\.[^.]+$/, "");
      const row = rows.find((r) => r.id === rowId);
      const path = `${folder}/${obj.name}`;
      const {
        data: { publicUrl },
      } = supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path);
      // Stamped with the object's own mtime, not Date.now(): a stable URL
      // per version of the file, so the browser caches it between modal
      // opens but still refetches once the photo is replaced.
      const stamp = Date.parse(obj.updated_at ?? obj.created_at ?? "") || 0;
      images.push({
        url: stamp ? `${publicUrl}?v=${stamp}` : publicUrl,
        label: row ? row.name : `${kind} photo (row deleted)`,
        icon: row?.icon ?? null,
      });
    }
  }

  return { images, error: images.length === 0 ? failure : null };
}

/**
 * Both sources as the groups the picker renders, uploads first.
 *
 * The bundled set is walked in catalogue order rather than sorted, so its
 * headings come out in the order `stockImages.ts` intends — the list is
 * already contiguous by group, which `stockImages.test.ts` enforces.
 */
export function libraryGroups(
  uploads: LibraryImage[],
  bundled: Set<string>
): LibraryGroup[] {
  const groups: LibraryGroup[] = [];

  if (uploads.length > 0) {
    // De-duplicated by object: an admin who put the same photo on a category
    // and a sub-service should see it once, not twice.
    const seen = new Set<string>();
    const unique = uploads.filter((u) => {
      const key = u.url.split("?")[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    groups.push({ name: "Uploaded on this site", items: unique });
  }

  for (const s of STOCK_IMAGES) {
    if (!bundled.has(s.slug)) continue;
    const item: LibraryImage = { url: stockImageUrl(s.slug), label: s.label, icon: s.icon };
    const last = groups.at(-1);
    if (last && last.name === s.group) last.items.push(item);
    else groups.push({ name: s.group, items: [item] });
  }

  return groups;
}

/** True for a url that came from either half of the library. */
export function isLibraryUrl(url: string | null | undefined): boolean {
  return isStockImageUrl(url) || !!url?.includes(`/${CATALOG_BUCKET}/`);
}
