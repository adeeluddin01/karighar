"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { roleOf } from "@/components/nav";
import { useUser } from "@/lib/useUser";
import { useNotifications } from "@/lib/useNotifications";
import { notifHref } from "@/lib/notifHref";
import type { Notification } from "@/lib/types";
import { clsx } from "@/lib/clsx";

// Bell + dropdown showing recent notifications with an unread badge.
export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const { profile, providerStatus } = useUser();
  const role = roleOf(true, profile?.role, providerStatus);

  const { items, unread, markRead, markAll } = useNotifications(userId, {
    // Only fires for rows arriving live, so the initial page never toasts.
    onNew: (n) => toast(n.title, "info"),
  });

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.read) await markRead(n.id);
    // Role-aware: a provider sent to /bookings/view/ would land on a customer
    // page their RLS blocks.
    const href = notifHref(n, role);
    if (href) router.push(href);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="surface absolute right-0 z-20 mt-2 w-80 max-w-[90vw] overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="text-sm font-bold">Notifications</span>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs font-semibold text-primary">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items === null ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No notifications yet.
                </p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={clsx(
                      "block w-full border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-secondary",
                      !n.read && "bg-primary-light/50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleString("en-PK")}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
