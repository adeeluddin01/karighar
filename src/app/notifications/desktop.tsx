"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";
import type { Notification } from "@/lib/types";

export default function NotificationsPage() {
  const { user, loading } = useRequireAuth("/notifications");
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    if (!user) return;
    createClient()
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems((data as Notification[]) || []));
  }, [user]);

  async function open(n: Notification) {
    if (!n.read) await createClient().from("notifications").update({ read: true }).eq("id", n.id);
    if (n.job_id) router.push(`/bookings/view/?id=${n.job_id}`);
  }

  async function markAll() {
    if (!user) return;
    await createClient()
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }

  if (loading || !user) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  const unread = items.filter((i) => !i.read).length;

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

      {items.length === 0 ? (
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
