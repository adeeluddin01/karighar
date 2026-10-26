"use client";

import { Switch } from "@/components/Lanes";
import DesktopPage from "./desktop";
import MobilePage from "./mobile";

// One lane mounts: this page fetches, so rendering both would double the work.
// Same shape as /providers/view — the public counterpart for a company, as
// /businesses is to /business what /providers is to /pro.
export default function Page() {
  return <Switch web={<DesktopPage />} phone={<MobilePage />} />;
}
