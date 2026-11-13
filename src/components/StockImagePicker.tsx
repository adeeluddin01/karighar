"use client";

import { useEffect, useState } from "react";
import { Shot } from "@/components/Shot";
import { type IconName } from "@/components/Icon";
import { CATEGORY_ICON_WEB } from "@/lib/catalogIcons";
import { clsx } from "@/lib/clsx";
import {
  STOCK_IMAGES,
  STOCK_IMAGE_DIR,
  STOCK_IMAGE_EXT,
  type StockImage,
  stockImageUrl,
} from "@/lib/stockImages";

/**
 * Which library slots actually have a file behind them.
 *
 * There is no directory listing to ask: this is a static export, so
 * `public/` is just files on a CDN. Each slot is probed with a real image
 * load instead, which means artwork appears in the picker the moment it is
 * dropped into `public/services/` — no manifest to maintain, no rebuild,
 * nothing to forget to update.
 *
 * Memoised at module scope: the answer cannot change within a page load,
 * and this is the only thing that keeps it from being ~120 requests every
 * time a modal opens rather than once per visit to /admin/catalog. It is
 * also why the probe is lazy — it does not start until a picker is first
 * rendered, so the rest of the admin never pays for it.
 */
let probe: Promise<Set<string>> | null = null;

function availableStockImages(): Promise<Set<string>> {
  if (probe) return probe;
  probe = Promise.all(
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
  return probe;
}

/**
 * Pick a picture from the bundled library.
 *
 * Renders nothing at all while probing, and an explanatory line if the
 * folder is empty — an admin should never be shown a grid of broken slots
 * and left to guess which are real.
 */
export function StockImagePicker({
  value,
  onPick,
}: {
  /** The currently selected slug, if the row is using a library picture. */
  value: string | null;
  onPick: (slug: string) => void;
}) {
  const [have, setHave] = useState<Set<string> | null>(null);

  useEffect(() => {
    let live = true;
    void availableStockImages().then((s) => {
      if (live) setHave(s);
    });
    return () => {
      live = false;
    };
  }, []);

  if (have === null) {
    return <p className="text-xs text-muted-foreground">Checking the picture library…</p>;
  }

  if (have.size === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        The picture library is empty. Drop <code>.{STOCK_IMAGE_EXT}</code> files into{" "}
        <code>public{STOCK_IMAGE_DIR}/</code> named after a service — for example{" "}
        <code>ac-installation.{STOCK_IMAGE_EXT}</code> — and they appear here. Until then, upload a
        photo above or leave it on the category icon.
      </p>
    );
  }

  // Grouped by walking the catalogue in order rather than sorting: the list
  // is already contiguous by group (stockImages.test.ts enforces it), so the
  // headings come out in the order the catalogue intends.
  const groups: { name: string; items: StockImage[] }[] = [];
  for (const s of STOCK_IMAGES) {
    if (!have.has(s.slug)) continue;
    const last = groups.at(-1);
    if (last && last.name === s.group) last.items.push(s);
    else groups.push({ name: s.group, items: [s] });
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-border p-2">
      {groups.map((g) => (
        <div key={g.name} className="mb-3 last:mb-0">
          <p className="mb-1.5 px-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
            {g.name}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {g.items.map((s) => (
              <button
                key={s.slug}
                type="button"
                title={s.label}
                aria-label={s.label}
                aria-pressed={value === s.slug}
                onClick={() => onPick(s.slug)}
                className={clsx(
                  "flex flex-col gap-1 overflow-hidden rounded-lg border p-1 text-[10px] leading-tight transition-colors",
                  value === s.slug
                    ? "border-primary bg-primary-light text-primary"
                    : "border-transparent text-muted-foreground hover:bg-secondary"
                )}
              >
                <Shot
                  src={stockImageUrl(s.slug)}
                  icon={(CATEGORY_ICON_WEB[s.icon] ?? "wrench") as IconName}
                  className="rounded-md"
                />
                <span className="line-clamp-2 text-center">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
