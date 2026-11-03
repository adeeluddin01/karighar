import { LinkButton } from "@/components/ui";

// The pro job views used to offer one-way links instead of a switch —
// "Map view" on the list, "List view" on the map — so there was no
// visible toggle and no consistent order. This is one control, List
// first then Map, used identically on both screens; the current view
// reads as the active button.
export function ProViewToggle({ active }: { active: "list" | "map" }) {
  return (
    <div className="flex gap-1">
      <LinkButton
        href="/pro/dashboard"
        variant={active === "list" ? "primary" : "ghost"}
        size="sm"
      >
        List view
      </LinkButton>
      <LinkButton
        href="/pro/map"
        variant={active === "map" ? "primary" : "ghost"}
        size="sm"
        icon="map"
      >
        Map view
      </LinkButton>
    </div>
  );
}
