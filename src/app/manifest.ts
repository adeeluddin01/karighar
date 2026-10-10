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
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
