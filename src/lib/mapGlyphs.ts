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


  // ---- the wider catalogue. Same paths as the phone sprite, copied
  // rather than referenced: a data: URI has no host document to <use>
  // against, which is what the note at the top of this file is about. ----
  cleaning:
    "<path d=\"M11 3l1.9 5.6L18.5 10.5l-5.6 1.9L11 18l-1.9-5.6L3.5 10.5l5.6-1.9z\"/><path d=\"M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z\"/>",
  pest:
    "<rect x=\"7\" y=\"6.5\" width=\"10\" height=\"14\" rx=\"5\"/><path d=\"M9 4.2 10.6 6.6M15 4.2 13.4 6.6\"/><path d=\"M2.5 11H7M17 11h4.5M2.5 16H7M17 16h4.5M4 7l3 2M20 7l-3 2M4 20l3-2M20 20l-3-2\"/>",
  fridge:
    "<rect x=\"5\" y=\"2.5\" width=\"14\" height=\"19\" rx=\"2.5\"/><path d=\"M5 10h14\"/><path d=\"M8.5 5.5v2.5M8.5 12.5v3\"/>",
  water:
    "<path d=\"M8 3.5s4 4.3 4 7.2A4 4 0 0 1 4 10.7C4 7.8 8 3.5 8 3.5z\"/><path d=\"M16.5 10s4 4.3 4 7.2a4 4 0 0 1-8 0c0-2.9 4-7.2 4-7.2z\"/>",
  geyser:
    "<path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z\"/>",
  locksmith:
    "<circle cx=\"7.5\" cy=\"16.5\" r=\"3.6\"/><path d=\"m10.1 14 9.4-9.4\"/><path d=\"m16.4 7.7 2 2M18.8 5.3l2.2 2.2\"/>",
  movers:
    "<path d=\"M2.5 7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10H2.5z\"/><path d=\"M13.5 10.5H17l3.5 3.5V17h-7z\"/><circle cx=\"6.5\" cy=\"18.5\" r=\"1.8\"/><circle cx=\"17\" cy=\"18.5\" r=\"1.8\"/>",
  garden:
    "<path d=\"M7 20.5h10\"/><path d=\"M12 20.5V9.5\"/><path d=\"M12 9.5C12 6.5 9.5 4 6 4c0 3.5 2.5 5.5 6 5.5z\"/><path d=\"M12 12c0-2.5 2-4.5 5-4.5 0 2.8-2.2 4.5-5 4.5z\"/>",
  internet:
    "<path d=\"M2 8.5a15 15 0 0 1 20 0\"/><path d=\"M5 12.2a10.5 10.5 0 0 1 14 0\"/><path d=\"M8.5 15.8a5.5 5.5 0 0 1 7 0\"/><path d=\"M12 19.3h.01\"/>",
  tv:
    "<rect x=\"2.5\" y=\"7\" width=\"19\" height=\"13.5\" rx=\"2.5\"/><path d=\"m7 3 5 4 5-4\"/>",
  tiles:
    "<rect x=\"3\" y=\"3\" width=\"7.5\" height=\"7.5\" rx=\"1.2\"/><rect x=\"13.5\" y=\"3\" width=\"7.5\" height=\"7.5\" rx=\"1.2\"/><rect x=\"3\" y=\"13.5\" width=\"7.5\" height=\"7.5\" rx=\"1.2\"/><rect x=\"13.5\" y=\"13.5\" width=\"7.5\" height=\"7.5\" rx=\"1.2\"/>",
  fan:
    "<circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M12 10c0-3 1-6 3.4-6 2 0 2.8 2.3 1.4 3.8C15.5 9.2 13.8 10 12 10z\"/><path d=\"M14 12c3 0 6 1 6 3.4 0 2-2.3 2.8-3.8 1.4C14.8 15.5 14 13.8 14 12z\"/><path d=\"M12 14c0 3-1 6-3.4 6-2 0-2.8-2.3-1.4-3.8C8.5 14.8 10.2 14 12 14z\"/><path d=\"M10 12c-3 0-6-1-6-3.4 0-2 2.3-2.8 3.8-1.4C9.2 8.5 10 10.2 10 12z\"/>",
  bath:
    "<path d=\"M4 2.8v6.7a3 3 0 0 0 3 3h1.6\"/><path d=\"M2.4 2.8h3.2\"/><rect x=\"8.6\" y=\"11\" width=\"12.9\" height=\"3.4\" rx=\"1.7\"/><path d=\"M11.8 17.4V19M15 17.4V19M18.2 17.4V19\"/>",
  light:
    "<path d=\"M9 18.5h6M10 21.5h4\"/><path d=\"M12 2.5a6 6 0 0 0-3.5 10.9c.6.5.9 1.2.9 1.9v.2h5.2v-.2c0-.7.3-1.4.9-1.9A6 6 0 0 0 12 2.5z\"/>",
  furniture:
    "<path d=\"M3 11.5V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3.5\"/><path d=\"M4.5 11.5A1.5 1.5 0 0 0 3 13v4.5h18V13a1.5 1.5 0 0 0-3 0v1.5H6V13a1.5 1.5 0 0 0-1.5-1.5z\"/><path d=\"M5.5 17.5v2M18.5 17.5v2\"/>",
  masonry:
    "<rect x=\"2.5\" y=\"4.5\" width=\"19\" height=\"6\" rx=\"1.2\"/><rect x=\"2.5\" y=\"13.5\" width=\"19\" height=\"6\" rx=\"1.2\"/><path d=\"M9 4.5v6M15.5 4.5v6M6 13.5v6M12.5 13.5v6M19 13.5v6\"/>",
  laundry:
    "<path d=\"M8.5 3 12 6l3.5-3 4.5 2.3-1.6 4.4-2 .5v11.3H6.6V10.2l-2-.5L3 5.3z\"/>",
  auto:
    "<path d=\"M3 13.5 5 8a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5.5V17a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z\"/><path d=\"M3.2 13.5h17.6\"/><path d=\"M6.6 15.9h.01M17.4 15.9h.01\"/>",
  smart:
    "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/><rect x=\"9.5\" y=\"9.5\" width=\"5\" height=\"5\" rx=\"1\"/><path d=\"M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5\"/>",
  interior:
    "<path d=\"M16.5 2.4 21.6 7.5 7.5 21.6 2.4 16.5z\"/><path d=\"m6 13.1 2 2M9 10.1l2 2M12 7.1l2 2M15 4.1l2 2\"/>",
  pet:
    "<path d=\"M5 4.5v4.2L3.7 10a2 2 0 0 0-.7 1.5V17a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-5.5a2 2 0 0 0-.7-1.5L19 8.7V4.5l-3 2.2H8z\"/><path d=\"M9.5 13.5h.01M14.5 13.5h.01\"/><path d=\"M12 17.2c-1 0-1.8-.6-1.8-1.4h3.6c0 .8-.8 1.4-1.8 1.4z\"/>",
  chef:
    "<path d=\"M6 2.5v7.5a2.6 2.6 0 0 0 5.2 0V2.5\"/><path d=\"M8.6 10v11.5\"/><path d=\"M6 2.5v5.2M11.2 2.5v5.2\"/><path d=\"M17.8 2.5c-1.6 1.6-2.2 3.7-2.2 6.2s.6 3.2 2.2 3.2 2.2-.7 2.2-3.2-.6-4.6-2.2-6.2z\"/><path d=\"M17.8 11.9v9.6\"/>",
  health:
    "<path d=\"M5.5 2.5v6a4.5 4.5 0 0 0 9 0v-6\"/><path d=\"M4 2.5h3M13 2.5h3\"/><path d=\"M10 13v2.2a4 4 0 0 0 8 0v-1.8\"/><circle cx=\"18\" cy=\"11\" r=\"2.4\"/>",
  tutor:
    "<path d=\"M12 3 1.8 8.4 12 13.8l10.2-5.4z\"/><path d=\"M5.8 10.8v5.4c0 1.6 2.8 3 6.2 3s6.2-1.4 6.2-3v-5.4\"/><path d=\"M21.2 9.5v5.2\"/>",
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
