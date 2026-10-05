"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/Icon";
import type { Notification } from "@/lib/types";
import { clsx } from "@/lib/clsx";

// Bell + dropdown showing recent notifications with an unread badge.
export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);
    setItems((data as Notification[]) || []);
  }, [userId]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 15))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const unread = items.filter((i) => !i.read).length;

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.read) {
      await createClient().from("notifications").update({ read: true }).eq("id", n.id);
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
    }
    if (n.job_id) router.push(`/bookings/view/?id=${n.job_id}`);
  }

  async function markAll() {
    await createClient()
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Notifications"
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
              {items.length === 0 ? (
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
