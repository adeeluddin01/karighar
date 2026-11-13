import { describe, it, expect } from "vitest";
import { CATEGORY_ICON_CHOICES } from "./catalogIcons";
import {
  STOCK_IMAGES,
  STOCK_IMAGE_DIR,
  STOCK_IMAGE_EXT,
  STOCK_IMAGE_GROUPS,
  isStockImageUrl,
  stockImageSlug,
  stockImageUrl,
} from "./stockImages";

describe("STOCK_IMAGES", () => {
  it("offers at least a hundred slots", () => {
    expect(STOCK_IMAGES.length).toBeGreaterThanOrEqual(100);
  });

  // The slug is the filename stem AND the picker's identity, so a duplicate
  // would make two slots fight over one file.
  it("has no duplicate slugs", () => {
    const seen = new Set(STOCK_IMAGES.map((s) => s.slug));
    expect(seen.size).toBe(STOCK_IMAGES.length);
  });

  // A slug becomes a path segment and a filename on disk. Anything outside
  // this alphabet is a trap on one OS or the other, or needs url-escaping
  // that `stockImageUrl` does not do.
  it("uses only lowercase, digits and hyphens in slugs", () => {
    for (const s of STOCK_IMAGES) {
      expect(s.slug, s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("gives every slot a label and a group", () => {
    for (const s of STOCK_IMAGES) {
      expect(s.label.trim(), s.slug).not.toBe("");
      expect(s.group.trim(), s.slug).not.toBe("");
    }
  });

  // THE LOAD-BEARING ONE. A slot's icon is what the card draws when its
  // file is missing — which is every slot until artwork is added. An icon
  // slug outside CATEGORY_ICON_CHOICES silently renders a wrench on both
  // lanes, so the fallback has to be provably real.
  it("falls back only to icons both lanes can draw", () => {
    const known = new Set(CATEGORY_ICON_CHOICES.map((c) => c.slug));
    for (const s of STOCK_IMAGES) {
      expect(known.has(s.icon), `${s.slug} -> ${s.icon}`).toBe(true);
    }
  });

  it("keeps each group's slots contiguous, so the picker needs no sort", () => {
    const order = STOCK_IMAGES.map((s) => s.group);
    const firstSeen = order.map((g) => order.indexOf(g));
    // A group that reappears after another group has started would make
    // the rendered headings repeat.
    for (let i = 1; i < order.length; i++) {
      if (order[i] !== order[i - 1]) {
        expect(firstSeen[i], order[i]).toBe(i);
      }
    }
  });

  it("lists every group exactly once, in catalogue order", () => {
    expect(STOCK_IMAGE_GROUPS).toEqual([...new Set(STOCK_IMAGES.map((s) => s.group))]);
    expect(new Set(STOCK_IMAGE_GROUPS).size).toBe(STOCK_IMAGE_GROUPS.length);
  });
});

describe("stockImageUrl", () => {
  it("builds a root-relative path in the library's one format", () => {
    expect(stockImageUrl("ac-installation")).toBe(`${STOCK_IMAGE_DIR}/ac-installation.webp`);
    expect(STOCK_IMAGE_EXT).toBe("webp");
  });

  it("round-trips through stockImageSlug for every slot", () => {
    for (const s of STOCK_IMAGES) {
      expect(stockImageSlug(stockImageUrl(s.slug)), s.slug).toBe(s.slug);
    }
  });
});

describe("isStockImageUrl", () => {
  it("recognises a library pick", () => {
    expect(isStockImageUrl(stockImageUrl("leak-repair"))).toBe(true);
  });

  // An uploaded photo is an absolute Supabase url. Confusing the two would
  // make Remove think there is a bucket object to forget, or make the
  // editor label an upload as a library pick.
  it("rejects an uploaded photo's url, and the empty cases", () => {
    expect(isStockImageUrl("https://x.supabase.co/storage/v1/object/public/catalog/a.jpg")).toBe(
      false
    );
    expect(isStockImageUrl(null)).toBe(false);
    expect(isStockImageUrl(undefined)).toBe(false);
    expect(isStockImageUrl("")).toBe(false);
  });

  it("returns null from stockImageSlug for anything that isn't one", () => {
    expect(stockImageSlug("https://x.supabase.co/storage/v1/object/public/catalog/a.jpg")).toBeNull();
    expect(stockImageSlug(null)).toBeNull();
  });
});
