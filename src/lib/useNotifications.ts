"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LIMIT,
  acquire,
  addListener,
  patch,
  snapshot,
  type Deps,
} from "@/lib/notificationsStore";
import type { Notification } from "@/lib/types";

/**
 * React binding over the shared notifications store.
 *
 * All the interesting behaviour — one query and one realtime channel per
 * user, however many components ask for them — lives in notificationsStore,
 * which has no React in it and is tested directly. See the comment there for
 * why sharing is mandatory rather than merely tidy.
 */

// Talking to Supabase, kept out of the store so the store stays testable.
const deps: Deps = {
  async fetchPage(uid, limit) {
    const { data } = await createClient()
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data as Notification[]) ?? [];
  },

  subscribeToInserts(uid, onInsert) {
    const supabase = createClient();
    const channel = supabase
      .channel(`notif:${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        (payload) => onInsert(payload.new as Notification)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },
};

export function useNotifications(
  userId?: string | null,
  opts?: {
    /** How many rows this consumer shows. */
    limit?: number;
    /** Fired only for rows arriving live — never for the initial page. */
    onNew?: (n: Notification) => void;
  }
) {
  const uid = userId || null;
  const limit = opts?.limit ?? LIMIT;

  // Held in a ref so passing an inline callback doesn't churn the store.
  const onNew = useRef(opts?.onNew);
  useEffect(() => {
    onNew.current = opts?.onNew;
  });

  const subscribe = useCallback(
    (cb: () => void) => (uid ? addListener(uid, cb) : () => {}),
    [uid]
  );

  // Must not create a store: this runs during render. The snapshot keeps its
  // array identity until the store publishes, which is what
  // useSyncExternalStore needs in order not to loop.
  const getSnapshot = useCallback(() => snapshot(uid), [uid]);
  const all = useSyncExternalStore(subscribe, getSnapshot, () => null);

  useEffect(() => {
    if (!uid) return;
    return acquire(uid, deps, (n) => onNew.current?.(n));
  }, [uid]);

  const markRead = useCallback(
    async (id: string) => {
      if (!uid) return;
      // Optimistic: the badge should drop the moment the row is opened.
      patch(uid, (list) => list.map((i) => (i.id === id ? { ...i, read: true } : i)));
      await createClient().from("notifications").update({ read: true }).eq("id", id);
    },
    [uid]
  );

  const markAll = useCallback(async () => {
    if (!uid) return;
    patch(uid, (list) => list.map((i) => ({ ...i, read: true })));
    await createClient()
      .from("notifications")
      .update({ read: true })
      .eq("user_id", uid)
      .eq("read", false);
  }, [uid]);

  return {
    // `null` means "not known yet", so callers can tell it from a genuine
    // empty list and show a skeleton.
    items: all === null ? null : all.length > limit ? all.slice(0, limit) : all,
    unread: (all ?? []).filter((i) => !i.read).length,
    markRead,
    markAll,
  };
}

/**
 * Just the badge number. Shares the store above, so a screen showing only a
 * dot adds no extra query and no extra channel.
 */
export function useUnreadCount(userId?: string | null): number {
  return useNotifications(userId).unread;
}
