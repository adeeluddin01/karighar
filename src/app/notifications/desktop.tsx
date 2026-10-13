"use client";

import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/useUser";
import { useNotifications } from "@/lib/useNotifications";
import { notifHref } from "@/lib/notifHref";
import { roleOf } from "@/components/nav";
import { AppShell } from "@/components/AppShell";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";
import type { Notification } from "@/lib/types";

export default function NotificationsPage() {
  const { user, profile, providerStatus, loading } = useRequireAuth("/notifications");
  const router = useRouter();
  // The shared hook adds realtime, and marking read now updates the list —
  // it previously wrote to the database only, so the row stayed bold.
  const { items, unread, markRead, markAll } = useNotifications(user?.id, { limit: 50 });
  const role = roleOf(!!user, profile?.role, providerStatus);

  async function open(n: Notification) {
    if (!n.read) await markRead(n.id);
    // A provider sent to /bookings/view/ would land on a customer page their
    // RLS blocks.
    const href = notifHref(n, role);
    if (href) router.push(href);
  }

  if (loading || !user) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up."}
        action={
          unread > 0 ? (
            <Button variant="ghost" size="sm" onClick={markAll}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {items === null ? (
        <Spinner label="Loading…" />
      ) : items.length === 0 ? (
        <EmptyState icon="bell" title="Nothing yet" hint="Updates about your bookings land here." />
      ) : (
        <Card padded={false} className="overflow-hidden">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n)}
              className={clsx(
                "block w-full border-b border-border p-4 text-left last:border-b-0 hover:bg-secondary",
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
                  <p className="font-semibold">{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("en-PK")}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </Card>
      )}
    </AppShell>
  );
}
