"use client";

import { useEffect, useState } from "react";
import { Shot } from "@/components/Shot";
import { type IconName } from "@/components/Icon";
import { CATEGORY_ICON_WEB } from "@/lib/catalogIcons";
import { clsx } from "@/lib/clsx";
import { STOCK_IMAGE_DIR, STOCK_IMAGE_EXT } from "@/lib/stockImages";
import {
  availableStockImages,
  libraryGroups,
  sameImage,
  type LibraryImage,
} from "@/lib/catalogLibrary";

/**
 * Pick a picture from the library — this install's uploads, then the
 * bundled artwork.
 *
 * `onPick` hands back the finished `image_url`, not a slug: the two halves
 * of the library produce different shapes of URL (a `/services/<slug>.webp`
 * path versus a Supabase public object URL) and the caller has no business
 * knowing which it got.
 *
 * Renders an explanatory line rather than a grid of broken slots when there
 * is nothing to offer — an admin should never be left guessing which tiles
 * are real.
 */
export function StockImagePicker({
  value,
  uploads,
  uploadsError,
  onPick,
}: {
  /** The row's current `image_url`, so the tile that is on can be marked. */
  value: string | null;
  /** This install's uploaded photos, fetched once by the page. */
  uploads: LibraryImage[];
  /** Why the bucket couldn't be listed, if it couldn't. */
  uploadsError?: string | null;
  onPick: (url: string) => void;
}) {
  const [bundled, setBundled] = useState<Set<string> | null>(null);

  useEffect(() => {
    let live = true;
    void availableStockImages().then((s) => {
      if (live) setBundled(s);
    });
    return () => {
      live = false;
    };
  }, []);

  if (bundled === null) {
    return <p className="text-xs text-muted-foreground">Checking the picture library…</p>;
  }

  const groups = libraryGroups(uploads, bundled);

  if (groups.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        {uploadsError && <p className="mb-1.5 font-semibold text-destructive">{uploadsError}</p>}
        <p>
          Nothing in the library yet. Upload a photo above and it appears here, reusable on any
          other service. You can also drop <code>.{STOCK_IMAGE_EXT}</code> files into{" "}
          <code>public{STOCK_IMAGE_DIR}/</code> to ship artwork with the app — see that folder&apos;s
          README.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-border p-2">
      {uploadsError && (
        <p className="mb-2 px-1 text-xs font-semibold text-destructive">{uploadsError}</p>
      )}
      {groups.map((g) => (
        <div key={g.name} className="mb-3 last:mb-0">
          <p className="mb-1.5 px-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
            {g.name}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.items.map((s) => {
              const on = sameImage(value, s.url);
              return (
                <button
                  key={s.url}
                  type="button"
                  title={s.label}
                  aria-label={s.label}
                  aria-pressed={on}
                  onClick={() => onPick(s.url)}
                  className={clsx(
                    "flex flex-col gap-1 overflow-hidden rounded-lg border p-1 text-[10px] leading-tight transition-colors",
                    on
                      ? "border-primary bg-primary-light text-primary"
                      : "border-transparent text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <Shot
                    src={s.url}
                    icon={(CATEGORY_ICON_WEB[s.icon ?? ""] ?? "wrench") as IconName}
                    className="rounded-md"
                  />
                  <span className="line-clamp-2 text-center">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
