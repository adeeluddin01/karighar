"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { Screen, Scroll, TopBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { EmptyK, Skel, Well } from "@/components/kg/parts";
import { clsx } from "@/lib/clsx";
import type { Notification } from "@/lib/types";

// Which glyph a notification gets, by the `type` the DB triggers write.
function iconFor(type: string) {
  if (type.startsWith("job_assigned")) return "shield" as const;
  if (type.startsWith("job")) return "wrench" as const;
  if (type.startsWith("bid")) return "cash" as const;
  if (type.startsWith("status")) return "nav" as const;
  if (type.startsWith("message")) return "chat" as const;
  return "bell" as const;
}

export default function NotificationsScreen() {
  const { user, loading } = useRequireAuth("/notifications");
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);

  useEffect(() => {
    if (!user) return;
    createClient()
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems((data as Notification[]) ?? []));
  }, [user]);

  async function open(n: Notification) {
    if (!n.read) {
      await createClient().from("notifications").update({ read: true }).eq("id", n.id);
      setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, read: true } : i)) ?? prev);
    }
    if (n.job_id) router.push(`/bookings/view/?id=${n.job_id}`);
  }

  async function markAll() {
    if (!user) return;
    await createClient()
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setItems((prev) => prev?.map((i) => ({ ...i, read: true })) ?? prev);
  }

  const unread = (items ?? []).filter((i) => !i.read).length;

  return (
    <Screen>
      <TopBar
        title="Notifications"
        back="/profile"
        action={
          unread > 0 ? (
            <button type="button" className="ic" onClick={markAll} aria-label="Mark all read">
              <KIcon name="check" />
            </button>
          ) : undefined
        }
      />
      <Scroll underTop pad="plain">
        <small>{unread ? `${unread} unread` : "You're all caught up."}</small>

        {loading || items === null ? (
          <>
            <Skel h={76} />
            <Skel h={76} />
          </>
        ) : items.length === 0 ? (
          <EmptyK icon="bell" title="Nothing yet" hint="Updates about your bookings land here." />
        ) : (
          <div className="menu card">
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={clsx(!n.read && "kg-unread")}
              >
                <Well icon={iconFor(n.type)} size="sm" />
                <div>
                  <b>{n.title}</b>
                  {n.body && <small>{n.body}</small>}
                  <small>{new Date(n.created_at).toLocaleString("en-PK")}</small>
                </div>
                {n.read ? (
                  n.job_id && <KIcon name="chev-r" className="chev" />
                ) : (
                  <span className="dot" />
                )}
              </button>
            ))}
          </div>
        )}
      </Scroll>
    </Screen>
  );
}
