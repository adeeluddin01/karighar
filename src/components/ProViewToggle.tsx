import { LinkButton } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";

// The switch between the pro's two job views, List first then Map. It
// lives ONLY on the map page: the dashboard IS the list view, so a toggle
// there just bounced the pro between home and itself — tapping "List view"
// on the map landed on home with the same toggle showing List active,
// which read as a redirect rather than a view switch. From the map,
// "List view" goes to the plain list (the provider home); "Map view"
// stays here. The map itself is still reachable from the dashboard via
// the sidebar and the tab bar.
export function ProViewToggle({ active }: { active: "list" | "map" }) {
  const { t } = useLanguage();
  return (
    <div className="flex gap-1">
      <LinkButton
        href="/pro/dashboard"
        variant={active === "list" ? "primary" : "ghost"}
        size="sm"
      >
        {t("pro.listView")}
      </LinkButton>
      <LinkButton
        href="/pro/map"
        variant={active === "map" ? "primary" : "ghost"}
        size="sm"
        icon="map"
      >
        {t("pro.mapView")}
      </LinkButton>
    </div>
  );
}
