import type { Notification } from "@/lib/types";

/* ============================================================
   One notifications subscription per user, shared by every component.

   This is a module-level store rather than per-component state because two
   things in supabase-js conspire:

     * `createBrowserClient` returns a SINGLETON in the browser, so every
       caller of createClient() shares one realtime client; and
     * `RealtimeClient.channel(topic)` RETURNS AN EXISTING channel when one
       with that topic is already registered.

   So a second component calling `.channel("notif:<uid>").on(...)` gets the
   first component's already-subscribed channel, and RealtimeChannel throws:

       cannot add `postgres_changes` callbacks for
       realtime:notif:<uid> after `subscribe()`

   That is what broke every legacy-UI page: <Sidebar> and <AppHeader> (which
   owns <NotificationBell>) are both mounted — one is hidden by CSS, not
   unmounted — so both ran the hook. Teardown was just as bad: whichever
   unmounted first called removeChannel() and killed live updates for the
   other.

   Kept free of React so the reference counting can be tested directly.
   ============================================================ */

// One page is enough for the bell and the full list alike; the list slices
// what it needs. Per-consumer limits would mean per-consumer state, which is
// the thing this store exists to avoid.
export const LIMIT = 50;

/** The slice of the Supabase client this store needs. */
export type Deps = {
  fetchPage: (uid: string, limit: number) => Promise<Notification[]>;
  /** Opens the live subscription; returns a teardown. */
  subscribeToInserts: (uid: string, onInsert: (n: Notification) => void) => () => void;
};

type Store = {
  items: Notification[] | null;
  refs: number;
  teardown: (() => void) | null;
  /** Snapshot subscribers (useSyncExternalStore). */
  listeners: Set<() => void>;
  /** Per-consumer callbacks for rows arriving live. */
  onNew: Set<(n: Notification) => void>;
};

const stores = new Map<string, Store>();

function store(uid: string): Store {
  let s = stores.get(uid);
  if (!s) {
    s = { items: null, refs: 0, teardown: null, listeners: new Set(), onNew: new Set() };
    stores.set(uid, s);
  }
  return s;
}

function publish(s: Store, items: Notification[] | null) {
  s.items = items;
  s.listeners.forEach((l) => l());
}

/** Current rows, or null when not loaded yet. Never creates a store. */
export function snapshot(uid: string | null): Notification[] | null {
  return uid ? (stores.get(uid)?.items ?? null) : null;
}

export function addListener(uid: string, cb: () => void): () => void {
  const s = store(uid);
  s.listeners.add(cb);
  return () => {
    s.listeners.delete(cb);
  };
}

export function patch(uid: string, fn: (items: Notification[]) => Notification[]) {
  const s = stores.get(uid);
  if (s?.items) publish(s, fn(s.items));
}

/**
 * Attach a consumer. The first one opens the query and the channel; the rest
 * just share them. Returns a detach function — the last one out closes both.
 */
export function acquire(uid: string, deps: Deps, onNew?: (n: Notification) => void): () => void {
  const s = store(uid);
  s.refs += 1;
  if (onNew) s.onNew.add(onNew);

  if (s.refs === 1) {
    deps.fetchPage(uid, LIMIT).then((rows) => {
      // Still wanted? A fast mount/unmount could have released it already.
      if (stores.get(uid) === s) publish(s, rows);
    });

    s.teardown = deps.subscribeToInserts(uid, (row) => {
      // Realtime can replay; don't double-insert a row we already hold.
      if (s.items?.some((i) => i.id === row.id)) return;
      publish(s, [row, ...(s.items ?? [])].slice(0, LIMIT));
      s.onNew.forEach((fn) => fn(row));
    });
  }

  let detached = false;
  return () => {
    if (detached) return; // releasing twice would close a channel others use
    detached = true;
    if (onNew) s.onNew.delete(onNew);
    s.refs -= 1;
    if (s.refs > 0) return;
    s.teardown?.();
    stores.delete(uid);
  };
}

/** Test seam. */
export function __resetStores() {
  stores.forEach((s) => s.teardown?.());
  stores.clear();
}

export function __activeStoreCount() {
  return stores.size;
}
