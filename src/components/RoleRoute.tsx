"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/useUser";
import { ROLE_ROUTES, isActive, roleOf, type RoleRouteKey } from "@/components/nav";

/**
 * Keeps the customer-only Home and Map to customers.
 *
 * A provider or admin who reaches `/` or `/map` is sent to their own
 * equivalent (`/pro/dashboard`, `/pro/map`, `/admin`…). While the session is
 * still resolving the children stay on screen, so the prerendered marketing
 * HTML is intact for crawlers and nobody sees a blank page; the moment the
 * role is known and wrong, the children are dropped and the redirect fires.
 */
export function RoleRoute({
  route,
  children,
}: {
  route: RoleRouteKey;
  children: React.ReactNode;
}) {
  const { user, profile, providerStatus, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const dest = loading ? null : ROLE_ROUTES[route][roleOf(!!user, profile?.role, providerStatus)];
  const elsewhere = dest !== null && !isActive(pathname, dest);

  useEffect(() => {
    if (elsewhere && dest) router.replace(dest);
  }, [elsewhere, dest, router]);

  if (elsewhere) return null;
  return <>{children}</>;
}
