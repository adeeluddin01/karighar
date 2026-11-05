import { Button } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";

// The map tab's view switch — List | Map. It switches IN PLACE: the list
// area and the map are two views of the same tab, so List never navigates
// anywhere. (It used to be a pair of links, List → /pro/dashboard — but
// the dashboard IS the list view, so tapping List on the map just landed
// on home, which read as a redirect rather than a view switch.) It lives
// ONLY on /pro/map; the dashboard has no toggle at all.
export function ProViewToggle({
  value,
  onChange,
}: {
  value: "list" | "map";
  onChange: (next: "list" | "map") => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex gap-2">
      <Button
        variant={value === "list" ? "primary" : "ghost"}
        size="sm"
        onClick={() => onChange("list")}
      >
        {t("pro.listView")}
      </Button>
      <Button
        variant={value === "map" ? "primary" : "ghost"}
        size="sm"
        icon="map"
        onClick={() => onChange("map")}
      >
        {t("pro.mapView")}
      </Button>
    </div>
  );
}
