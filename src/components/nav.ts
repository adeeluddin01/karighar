import type { IconName } from "@/components/Icon";
import type { KIconName } from "@/components/kg/icons";

export type Role = "guest" | "customer" | "provider" | "admin";

export type NavLink = { href: string; label: string; icon: IconName };

// Role-aware navigation for the desktop sidebar.
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
/* ============================================================
   Phone tab bar
   ============================================================ */

// The redesign's pill tab bar holds four destinations: three icons plus the
// active one, which grows to show its label. A fifth doesn't fit at 360px.
//
// `kicon` is the same glyph from the redesign's sprite — the bar is drawn with
// <KIcon> inside the `.kg` screens and with the Lucide <Icon> in <BottomNav>,
// which renders outside that scope on the provider/admin pages.
export type PhoneNavLink = NavLink & { kicon: KIconName };

// Mirrors NAV's role split, so the tab bar on a phone is role-aware exactly as
// the sidebar is on desktop. What doesn't fit stays reachable from the screens
// themselves — Profile links to notifications and support, the pro dashboard
// links to history, admin overview links to settlements.
export const PHONE_NAV: Record<Role, PhoneNavLink[]> = {
  // A signed-out visitor gets the customer shape; Bookings and Profile send
  // them to sign-in, which is the usual mobile pattern.
  guest: [
    { href: "/", label: "Home", icon: "home", kicon: "home" },
    { href: "/bookings", label: "Bookings", icon: "book", kicon: "cal" },
    { href: "/map", label: "Map", icon: "map", kicon: "map" },
    { href: "/profile", label: "Profile", icon: "user", kicon: "user" },
  ],
  customer: [
    { href: "/", label: "Home", icon: "home", kicon: "home" },
    { href: "/bookings", label: "Bookings", icon: "book", kicon: "cal" },
    { href: "/map", label: "Map", icon: "map", kicon: "map" },
    { href: "/profile", label: "Profile", icon: "user", kicon: "user" },
  ],
  provider: [
    { href: "/pro/dashboard", label: "Jobs", icon: "briefcase", kicon: "briefcase" },
    { href: "/pro/map", label: "Map", icon: "map", kicon: "map" },
    { href: "/pro/services", label: "Services", icon: "wrench", kicon: "wrench" },
    { href: "/profile", label: "Profile", icon: "user", kicon: "user" },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: "building", kicon: "gear" },
    { href: "/admin/providers", label: "Pros", icon: "users", kicon: "users" },
    { href: "/admin/jobs", label: "Jobs", icon: "briefcase", kicon: "briefcase" },
    { href: "/profile", label: "Profile", icon: "user", kicon: "user" },
  ],
};

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
