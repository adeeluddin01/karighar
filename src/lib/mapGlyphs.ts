import { CATEGORY_ICON_FALLBACK } from "@/lib/catalogIcons";

/**
 * Map-marker artwork for a service category.
 *
 * Google Maps takes a marker icon as a self-contained URL, so the data URI it
 * is handed cannot `<use>` the `.kg` sprite the rest of the phone lane draws
 * from: a `<use>` resolves against the host document, and a data URI has no
 * host document. The glyphs are therefore duplicated here as raw path markup,
 * and mapGlyphs.test.ts asserts this set stays in step with the catalogue's
 * offered slugs — the same contract catalogIcons.test.ts enforces for the two
 * component icon sets.
 *
 * Every glyph is stroke-only on a 24x24 grid, matching the sprite, so one
 * `fill="none" stroke="#fff"` wrapper draws all of them.
 */
export const CATEGORY_GLYPH: Record<string, string> = {
  ac: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/>',
  bolt: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H13z"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  carpenter:
    '<path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9"/><path d="M17.6 15 22 10.6"/><path d="m20.9 11.7-1.2-1.2c-.6-.6-1-1.4-1-2.3v-.8L16 4.6A5.6 5.6 0 0 0 12.1 3H9l.9.8A6.2 6.2 0 0 1 12 8.4V10l2 2h2.5l2.3 1.9"/>',
  painter:
    '<path d="m9.5 11.5 9-9a2.1 2.1 0 1 1 3 3l-9 9"/><path d="m8.5 10.5 5 5"/><path d="M8 12.5c-2.8 0-4.5 1.8-4.5 4.5 0 1.2-.8 2.3-2 2.5 2.2 1.8 6 1.5 7.5-.5 1-1.3 1.3-2.8.7-4"/>',
  solar:
    '<path d="M11 3l1.9 5.6L18.5 10.5l-5.6 1.9L11 18l-1.9-5.6L3.5 10.5l5.6-1.9z"/>',
  camera:
    '<path d="M22 18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.5l1.6-2.4A1 1 0 0 1 9 4h6a1 1 0 0 1 .9.6L17.5 7H20a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.6"/>',
  washer:
    '<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><circle cx="12" cy="14" r="5"/><path d="M8 6h.01M11.5 6h.01"/>',
};

/** Karighar saffron — the same hue the home pin and the brand mark use. */
const SAFFRON = "#ee7118";
/** The teal the dispatch console uses, so a company never reads as "you". */
const TEAL = "#0f766e";

/**
 * A teardrop marker carrying one trade's glyph.
 *
 * Returned as a `data:` URI ready for `google.maps.Icon.url`. An unknown or
 * missing slug falls back to the wrench, exactly as both component icon maps
 * do — a business with no trades recorded still gets a findable pin.
 */
export function businessPin(slug: string | null | undefined, highlight = false): string {
  const glyph = CATEGORY_GLYPH[slug ?? ""] ?? CATEGORY_GLYPH[CATEGORY_ICON_FALLBACK];
  const body = highlight ? SAFFRON : TEAL;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">' +
    `<path d="M17 40.5C17 40.5 31.5 25 31.5 16A14.5 14.5 0 1 0 2.5 16C2.5 25 17 40.5 17 40.5z" fill="${body}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>` +
    '<g transform="translate(17 15.5) scale(0.62) translate(-12 -12)" fill="none" stroke="#ffffff" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    glyph +
    "</g></svg>";
  // encodeURIComponent, not base64: it keeps the markup legible in devtools
  // and is what the existing home pin already does.
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
