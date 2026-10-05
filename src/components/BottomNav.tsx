"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/useUser";
import { Icon } from "@/components/Icon";
import { BOTTOM_NAV_LIMIT, NAV, isActive, roleOf } from "@/components/nav";
import { clsx } from "@/lib/clsx";

// Mobile tab bar (the prototype's `nav.bottom`). Role-aware, and present for
// guests too so an unauthenticated visitor can still move around on a phone.
export function BottomNav() {
  const { user, profile, providerStatus, loading } = useUser();
  const pathname = usePathname();
  if (loading) return null;

  const tabs = NAV[roleOf(!!user, profile?.role, providerStatus)].slice(0, BOTTOM_NAV_LIMIT);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-border bg-card px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:hidden">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={clsx(
            "flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-[11px]",
            isActive(pathname, t.href)
              ? "font-bold text-primary"
              : "font-medium text-muted-foreground"
          )}
        >
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
