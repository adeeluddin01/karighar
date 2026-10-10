import { LaneSplit } from "@/components/LaneSplit";
import { RoleRoute } from "@/components/RoleRoute";
import DesktopPage from "./desktop";
import MobilePage from "./mobile";

// `/` is the customer Home; a provider or admin is sent to their own landing
// page instead (see RoleRoute).
//
// Both lanes are static content, so they both render and CSS picks one —
// that keeps this page's prerendered HTML intact for crawlers.
export default function Page() {
  return (
    <RoleRoute route="home">
      <LaneSplit web={<DesktopPage />} phone={<MobilePage />} />
    </RoleRoute>
  );
}
