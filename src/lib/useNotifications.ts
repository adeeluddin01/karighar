"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

/* ============================================================
   One notifications subscription, shared.

   The same load-plus-realtime query was written out four times — the bell, the
   two /notifications lanes, and an unread head-count on the phone Bookings
   screen — and they had drifted: only the bell subscribed to realtime, and
   the desktop list marked rows read in the database without updating what was
   on screen.

   `notifications` is already in the `supabase_realtime` publication, so the
   INSERT subscription below genuinely fires.
   ============================================================ */

const DEFAULT_LIMIT = 15;

/**
 * Rows are stored alongside the user they were fetched for, so switching
 * account *derives* "not loaded yet" instead of needing a reset write inside
 * the effect — which would be a cascading render (react-hooks/set-state-in-effect).
 */
type Loaded = { uid: string; items: Notification[] };

export function useNotifications(
  userId?: string | null,
  opts?: {
    limit?: number;
    /** Fired only for rows arriving live — never for the initial page. */
    onNew?: (n: Notification) => void;
  }
) {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // `null` means "not known yet", so callers can tell it from a genuine empty
  // list and show a skeleton.
  const items = userId && loaded?.uid === userId ? loaded.items : null;

  // Held in a ref so changing the callback doesn't tear down the channel.
  const onNew = useRef(opts?.onNew);
  useEffect(() => {
    onNew.current = opts?.onNew;
  });

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let active = true;

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (active) setLoaded({ uid: userId, items: (data as Notification[]) ?? [] });
      });

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
        (payload) => {
          if (!active) return;
          const row = payload.new as Notification;
          setLoaded((prev) => {
            if (!prev || prev.uid !== userId) return prev;
            // Realtime can replay; don't double-insert a row we already hold.
            if (prev.items.some((i) => i.id === row.id)) return prev;
            return { uid: userId, items: [row, ...prev.items].slice(0, limit) };
          });
          onNew.current?.(row);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId, limit]);

  const patch = useCallback((fn: (items: Notification[]) => Notification[]) => {
    setLoaded((prev) => (prev ? { uid: prev.uid, items: fn(prev.items) } : prev));
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic: the badge should drop the moment the row is opened.
      patch((list) => list.map((i) => (i.id === id ? { ...i, read: true } : i)));
      await createClient().from("notifications").update({ read: true }).eq("id", id);
    },
    [patch]
  );

  const markAll = useCallback(async () => {
    if (!userId) return;
    patch((list) => list.map((i) => ({ ...i, read: true })));
    await createClient()
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
  }, [userId, patch]);

  return {
    items,
    unread: (items ?? []).filter((i) => !i.read).length,
    markRead,
    markAll,
  };
}

/**
 * Just the badge number. Built on the same hook so a screen showing only a
 * dot still shares one channel and one query shape with the full list.
 */
export function useUnreadCount(userId?: string | null): number {
  return useNotifications(userId).unread;
}
