import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KARIGHAR — Home Services Karachi",
    short_name: "KARIGHAR",
    description: "Book verified plumbers, electricians and AC technicians in Karachi.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f5f3",
    theme_color: "#1f5f4b",
    // Baked from public/brand/karighar-logo-3d.svg by scripts/icons.mjs.
    //
    // The maskable entry is a different file, not the same one relabelled:
    // Android crops a maskable icon to a shape of its own choosing and keeps
    // only the inner ~80%, so it needs the tile bled to the edges (ours would
    // otherwise be rounded twice) and the mark pulled into that safe zone.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
