import type { IconName } from "@/components/Icon";

export type Role = "guest" | "customer" | "provider" | "admin";

export type NavLink = { href: string; label: string; icon: IconName };

// Role-aware navigation, shared by the sidebar (desktop) and the bottom bar (mobile).
export const NAV: Record<Role, NavLink[]> = {
  guest: [
    { href: "/", label: "Home", icon: "home" },
    { href: "/book", label: "Services", icon: "wrench" },
    { href: "/pro", label: "Become a Pro", icon: "briefcase" },
    { href: "/support", label: "Support", icon: "chat" },
  ],
  customer: [
    { href: "/", label: "Home", icon: "home" },
    { href: "/book", label: "Book", icon: "wrench" },
    { href: "/bookings", label: "Bookings", icon: "book" },
    { href: "/notifications", label: "Alerts", icon: "bell" },
    { href: "/profile", label: "Profile", icon: "user" },
  ],
  provider: [
    { href: "/pro/dashboard", label: "Jobs", icon: "briefcase" },
    { href: "/pro/map", label: "Map", icon: "map" },
    { href: "/pro/services", label: "My Services", icon: "wrench" },
    { href: "/pro/history", label: "History", icon: "history" },
    { href: "/profile", label: "Profile", icon: "user" },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: "building" },
    { href: "/admin/providers", label: "Providers", icon: "users" },
    { href: "/admin/jobs", label: "Jobs", icon: "briefcase" },
    { href: "/admin/settlements", label: "Settlements", icon: "wallet" },
    { href: "/profile", label: "Profile", icon: "user" },
  ],
};

// The bottom bar has room for about five items; the sidebar shows them all.
export const BOTTOM_NAV_LIMIT = 5;

// A provider only gets the provider nav once their verification is
// `approved`. Someone who has applied but is still pending (or was rejected
// / suspended) sees the default customer view — their verification status
// and the onboarding form stay reachable from /profile.
export function roleOf(
  signedIn: boolean,
  role?: string | null,
  providerStatus?: string | null
): Role {
  if (!signedIn) return "guest";
  if (role === "admin") return "admin";
  if (role === "provider" && providerStatus === "approved") return "provider";
  return "customer";
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
