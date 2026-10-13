"use client";

import Link from "next/link";
import { KIcon } from "@/components/kg/icons";
import { useUser } from "@/lib/useUser";
import { useUnreadCount } from "@/lib/useNotifications";

/**
 * The phone lane's notifications entry point.
 *
 * The `.kg` surface had no bell at all: <AppHeader> carries one but is
 * `md:hidden`, and below `md` every customer route renders this surface
 * instead — so the only bell in the app was on phone-width provider/admin
 * pages. The tab bar can't take a fifth item (see PHONE_NAV), so the bell
 * lives in each screen's header instead.
 *
 * Renders nothing when signed out, where there is nothing to notify about.
 */
export function AlertsBell({ className = "ic" }: { className?: string }) {
  const { user } = useUser();
  const unread = useUnreadCount(user?.id);

  if (!user) return null;

  return (
    <Link
      className={className}
      href="/notifications/"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <KIcon name="bell" />
      {unread > 0 && <i className="ndot" />}
    </Link>
  );
}
