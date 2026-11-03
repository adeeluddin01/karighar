"use client";

import { Switch } from "@/components/Lanes";
import { CustomerOnly } from "@/components/CustomerOnly";
import DesktopPage from "./desktop";
import MobilePage from "./mobile";

// One lane mounts: this page fetches, so rendering both would double the work.
export default function Page() {
  return (
    <CustomerOnly>
      <Switch web={<DesktopPage />} phone={<MobilePage />} />
    </CustomerOnly>
  );
}
