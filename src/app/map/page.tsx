"use client";

import { Switch } from "@/components/Lanes";
import { RoleRoute } from "@/components/RoleRoute";
import DesktopPage from "./desktop";
import MobilePage from "./mobile";

// `/map` is the customer's "pros near you"; a provider gets their jobs map and
// an admin their jobs list instead (see RoleRoute).
//
// One lane mounts: this page fetches, so rendering both would double the work.
export default function Page() {
  return (
    <RoleRoute route="map">
      <Switch web={<DesktopPage />} phone={<MobilePage />} />
    </RoleRoute>
  );
}
