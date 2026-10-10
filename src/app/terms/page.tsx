import type { Metadata } from "next";
import { LaneSplit } from "@/components/LaneSplit";
import DesktopPage from "./desktop";
import MobilePage from "./mobile";

export const metadata: Metadata = { title: "Terms of Service — KARIGHAR" };

// Both lanes are static content, so they both render and CSS picks one —
// that keeps this page's prerendered HTML intact for crawlers.
export default function Page() {
  return <LaneSplit web={<DesktopPage />} phone={<MobilePage />} />;
}
