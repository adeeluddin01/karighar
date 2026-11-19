import { describe, it, expect } from "vitest";
import { isLibraryUrl, libraryGroups, sameImage, type LibraryImage } from "./catalogLibrary";
import { STOCK_IMAGES, stockImageUrl } from "./stockImages";

/* The picker's two jobs that can go silently wrong: deciding which tile is
   the one currently on, and merging two sources into one ordered list. Both
   are pure, and both were bugs before this module existed — an admin's own
   uploads were never offered at all, and a row's photo never showed as
   selected because the cache-bust made the strings differ. */

describe("sameImage", () => {
  it("ignores the ?v= cache-bust", () => {
    // uploadServiceImage() stamps Date.now(); a bucket listing stamps the
    // object's mtime. Same object, different query — and comparing the raw
    // strings is what stopped a row's own photo reading as selected.
    expect(sameImage("https://x/cat.jpg?v=111", "https://x/cat.jpg?v=999")).toBe(true);
    expect(sameImage("https://x/cat.jpg", "https://x/cat.jpg?v=999")).toBe(true);
  });

  it("still distinguishes different objects", () => {
    expect(sameImage("https://x/a.jpg?v=1", "https://x/b.jpg?v=1")).toBe(false);
  });

  it("is false when either side is missing", () => {
    // Not "equal": two rows with no photo are not using the same picture,
    // and treating them as equal would light up every tile in the grid.
    expect(sameImage(null, null)).toBe(false);
    expect(sameImage("", "")).toBe(false);
    expect(sameImage("https://x/a.jpg", null)).toBe(false);
  });
});

describe("libraryGroups", () => {
  const uploads: LibraryImage[] = [
    { url: "https://x/storage/v1/object/public/catalog/categories/1.jpg?v=5", label: "AC", icon: "ac" },
    { url: "https://x/storage/v1/object/public/catalog/services/2.png?v=6", label: "Wiring", icon: "bolt" },
  ];

  it("puts uploads first, under their own heading", () => {
    // On a real install these are the pictures an admin recognises, and
    // public/services/ is empty on a stock checkout.
    const groups = libraryGroups(uploads, new Set());
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Uploaded on this site");
    expect(groups[0].items.map((i) => i.label)).toEqual(["AC", "Wiring"]);
  });

  it("de-duplicates one object used on two rows", () => {
    // Same object, different cache-bust — one tile, not two. This is the
    // real case: an admin puts the same photo on a category and a
    // sub-service, and the two rows stamp it at different times.
    const sameObject = [
      uploads[0],
      { ...uploads[0], label: "AC again", url: `${uploads[0].url.split("?")[0]}?v=99` },
    ];
    expect(libraryGroups(sameObject, new Set())[0].items).toHaveLength(1);

    // A different path is a different picture, however similar the label.
    const distinct = [
      uploads[0],
      { ...uploads[0], label: "AC again", url: uploads[0].url.replace("/1.jpg", "/9.jpg") },
    ];
    expect(libraryGroups(distinct, new Set())[0].items).toHaveLength(2);
  });

  it("groups the bundled set in catalogue order, after the uploads", () => {
    const first = STOCK_IMAGES[0];
    const groups = libraryGroups(uploads, new Set([first.slug]));
    expect(groups.map((g) => g.name)).toEqual(["Uploaded on this site", first.group]);
    expect(groups[1].items[0].url).toBe(stockImageUrl(first.slug));
  });

  it("omits the uploads heading entirely when there are none", () => {
    const first = STOCK_IMAGES[0];
    const groups = libraryGroups([], new Set([first.slug]));
    expect(groups.map((g) => g.name)).toEqual([first.group]);
  });

  it("is empty when neither source has anything, so the picker can say so", () => {
    expect(libraryGroups([], new Set())).toEqual([]);
  });

  it("offers only bundled slots that actually have a file", () => {
    // The probe decides this; a slot with no file must not become a broken
    // tile the admin is left to guess about.
    expect(libraryGroups([], new Set(["definitely-not-a-slug"]))).toEqual([]);
  });
});

describe("isLibraryUrl", () => {
  it("recognises both halves of the library", () => {
    expect(isLibraryUrl(stockImageUrl("ac-installation"))).toBe(true);
    expect(isLibraryUrl("https://x/storage/v1/object/public/catalog/services/2.png")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLibraryUrl(null)).toBe(false);
    expect(isLibraryUrl("")).toBe(false);
    expect(isLibraryUrl("https://example.com/somebody-elses.jpg")).toBe(false);
  });
});
