"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/useUser";
import { Icon } from "@/components/Icon";
import { PHONE_NAV, isActive, roleOf } from "@/components/nav";
import { clsx } from "@/lib/clsx";

// Mobile tab bar for the pro and admin areas (the customer screens have their
// own <TabBar> inside the `.kg` surface). Same shape as the redesign's: a
// floating white pill where only the active tab shows its label, in a dark
// inner pill.
//
// Both bars read the same PHONE_NAV, so the tabs don't change shape when a
// provider moves between a customer screen and their own area.
export function BottomNav() {
  const { user, profile, providerStatus, loading } = useUser();
  const pathname = usePathname();
  if (loading) return null;

  const tabs = PHONE_NAV[roleOf(!!user, profile?.role, providerStatus)];

  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-4 bottom-[calc(1.1rem+env(safe-area-inset-bottom,0px))] z-40 flex h-[66px] items-center justify-between rounded-full bg-[var(--navbg)] p-1.5 shadow-[0_14px_34px_rgba(20,32,27,0.18)] md:hidden"
    >
      {tabs.map((t) => {
        const on = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-label={t.label}
            aria-current={on ? "page" : undefined}
            className={clsx(
              "inline-flex h-[54px] min-w-0 items-center gap-2 rounded-full text-sm font-extrabold",
              on
                ? "bg-[var(--navpill)] px-3.5 text-[var(--navfg)]"
                : "px-3 text-foreground"
            )}
          >
            <Icon name={t.icon} size="lg" />
            {on && <span className="truncate">{t.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
