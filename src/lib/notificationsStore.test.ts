import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIMIT,
  __activeStoreCount,
  __resetStores,
  acquire,
  addListener,
  patch,
  snapshot,
  type Deps,
} from "./notificationsStore";
import type { Notification } from "./types";

const UID = "65894323-6741-4760-96c2-773416226209";

function row(id: string, read = false): Notification {
  return {
    id, user_id: UID, type: "status", title: "t" + id, body: null,
    job_id: null, read, created_at: new Date().toISOString(),
  };
}

/**
 * Stands in for supabase-js, and reproduces the behaviour that caused the
 * production crash: the realtime client hands back an ALREADY-SUBSCRIBED
 * channel for a topic it has seen, and `.on()` after `subscribe()` throws.
 */
function fakeDeps(rows: Notification[] = []) {
  const subscribedTopics = new Set<string>();
  const state = { opens: 0, closes: 0, fetches: 0, emit: null as null | ((n: Notification) => void) };

  const deps: Deps = {
    async fetchPage(_uid, limit) {
      state.fetches += 1;
      return rows.slice(0, limit);
    },
    subscribeToInserts(uid, onInsert) {
      const topic = `notif:${uid}`;
      if (subscribedTopics.has(topic)) {
        throw new Error(
          `cannot add \`postgres_changes\` callbacks for realtime:${topic} after \`subscribe()\`.`
        );
      }
      subscribedTopics.add(topic);
      state.opens += 1;
      state.emit = onInsert;
      return () => {
        subscribedTopics.delete(topic);
        state.closes += 1;
        state.emit = null;
      };
    },
  };
  return { deps, state };
}

afterEach(() => __resetStores());

describe("sharing one subscription", () => {
  // The regression: <Sidebar> and <AppHeader> both mount on every legacy-UI
  // page, so two consumers existed for one user. The second used to throw.
  it("opens ONE channel for many simultaneous consumers", () => {
    const { deps, state } = fakeDeps();
    const a = acquire(UID, deps);
    const b = acquire(UID, deps);
    const c = acquire(UID, deps);
    expect(state.opens).toBe(1);
    expect(state.fetches).toBe(1);
    a(); b(); c();
  });

  it("would have thrown without sharing (the fake reproduces the real error)", () => {
    const { deps } = fakeDeps();
    deps.subscribeToInserts(UID, () => {});
    expect(() => deps.subscribeToInserts(UID, () => {})).toThrow(
      /cannot add `postgres_changes` callbacks .* after `subscribe\(\)`/
    );
  });

  it("keeps the channel open until the LAST consumer leaves", () => {
    const { deps, state } = fakeDeps();
    const a = acquire(UID, deps);
    const b = acquire(UID, deps);
    a();
    expect(state.closes).toBe(0); // b still needs it
    b();
    expect(state.closes).toBe(1);
    expect(__activeStoreCount()).toBe(0);
  });

  it("reopens cleanly after everyone has left", () => {
    const { deps, state } = fakeDeps();
    acquire(UID, deps)();
    expect(state.closes).toBe(1);
    const again = acquire(UID, deps);
    expect(state.opens).toBe(2);
    again();
  });

  it("ignores a double release, which would close a channel others use", () => {
    const { deps, state } = fakeDeps();
    const a = acquire(UID, deps);
    const b = acquire(UID, deps);
    a();
    a(); // repeated (React can invoke a cleanup more than once)
    expect(state.closes).toBe(0);
    b();
    expect(state.closes).toBe(1);
  });
});

describe("rows", () => {
  it("loads a page and exposes it to every consumer", async () => {
    const { deps } = fakeDeps([row("1"), row("2")]);
    const off = acquire(UID, deps);
    await vi.waitFor(() => expect(snapshot(UID)).toHaveLength(2));
    off();
  });

  it("is null until loaded, so callers can show a skeleton", () => {
    expect(snapshot(UID)).toBeNull();
    expect(snapshot(null)).toBeNull();
  });

  it("prepends a live row and notifies every onNew once", async () => {
    const { deps, state } = fakeDeps([row("1")]);
    const seenA: string[] = [];
    const seenB: string[] = [];
    const a = acquire(UID, deps, (n) => seenA.push(n.id));
    const b = acquire(UID, deps, (n) => seenB.push(n.id));
    await vi.waitFor(() => expect(snapshot(UID)).toHaveLength(1));

    state.emit!(row("2"));
    expect(snapshot(UID)![0].id).toBe("2");
    expect(seenA).toEqual(["2"]);
    expect(seenB).toEqual(["2"]);
    a(); b();
  });

  it("ignores a replayed row rather than duplicating it", async () => {
    const { deps, state } = fakeDeps([row("1")]);
    const seen: string[] = [];
    const off = acquire(UID, deps, (n) => seen.push(n.id));
    await vi.waitFor(() => expect(snapshot(UID)).toHaveLength(1));
    state.emit!(row("2"));
    state.emit!(row("2")); // same id again
    expect(snapshot(UID)).toHaveLength(2);
    expect(seen).toEqual(["2"]);
    off();
  });

  it("caps the list at LIMIT as live rows arrive", async () => {
    const { deps, state } = fakeDeps(Array.from({ length: LIMIT }, (_, i) => row("r" + i)));
    const off = acquire(UID, deps);
    await vi.waitFor(() => expect(snapshot(UID)).toHaveLength(LIMIT));
    state.emit!(row("new"));
    expect(snapshot(UID)).toHaveLength(LIMIT);
    expect(snapshot(UID)![0].id).toBe("new");
    off();
  });

  it("does not publish a late fetch into a released store", async () => {
    const { deps } = fakeDeps([row("1")]);
    acquire(UID, deps)(); // release before the fetch resolves
    await new Promise((r) => setTimeout(r, 10));
    expect(snapshot(UID)).toBeNull();
  });

  it("wakes listeners on change and stops after unsubscribe", async () => {
    const { deps, state } = fakeDeps([row("1")]);
    let hits = 0;
    const off = acquire(UID, deps);
    const stop = addListener(UID, () => hits++);
    await vi.waitFor(() => expect(hits).toBeGreaterThan(0));
    const atLoad = hits;
    state.emit!(row("2"));
    expect(hits).toBe(atLoad + 1);
    stop();
    state.emit!(row("3"));
    expect(hits).toBe(atLoad + 1);
    off();
  });

  it("patch marks rows read for everyone", async () => {
    const { deps } = fakeDeps([row("1"), row("2")]);
    const off = acquire(UID, deps);
    await vi.waitFor(() => expect(snapshot(UID)).toHaveLength(2));
    patch(UID, (list) => list.map((i) => ({ ...i, read: true })));
    expect(snapshot(UID)!.every((i) => i.read)).toBe(true);
    off();
  });

  it("keeps separate users separate", async () => {
    const other = "11111111-1111-1111-1111-111111111111";
    const { deps } = fakeDeps([row("1")]);
    const a = acquire(UID, deps);
    const b = acquire(other, deps);
    await vi.waitFor(() => expect(snapshot(UID)).not.toBeNull());
    expect(__activeStoreCount()).toBe(2);
    a(); b();
  });
});
