import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_VERSION,
  clearDraft,
  isRecord,
  readDraft,
  saveDraft,
  type Versioned,
} from "./bookingDraft";

// Minimal sessionStorage for the node test env.
function installStorage() {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get size() {
      return map.size;
    },
  };
  vi.stubGlobal("sessionStorage", store);
  return store;
}

type WebDraft = Versioned & { serviceId: string; step: number };

const isWebDraft = (v: unknown): v is WebDraft =>
  isRecord(v) && typeof v.serviceId === "string" && typeof v.step === "number";

const KEY = "kg-draft-book-service-web";

let store: ReturnType<typeof installStorage>;
beforeEach(() => {
  store = installStorage();
});

describe("saveDraft / readDraft", () => {
  it("round-trips a valid draft and stamps the version", () => {
    saveDraft(KEY, { serviceId: "svc-1", step: 2 });
    const got = readDraft(KEY, isWebDraft);
    expect(got).toEqual({ serviceId: "svc-1", step: 2, v: DRAFT_VERSION });
  });

  it("returns null when nothing is stored", () => {
    expect(readDraft(KEY, isWebDraft)).toBeNull();
  });

  // The bug this exists for: the other lane's shape must not be trusted.
  it("rejects and clears a draft of the wrong shape", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ v: DRAFT_VERSION, serviceId: "svc-1", pickedId: "x", when: "now" })
    );
    expect(readDraft(KEY, isWebDraft)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("rejects and clears a draft from an older version", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ v: DRAFT_VERSION - 1, serviceId: "a", step: 1 }));
    expect(readDraft(KEY, isWebDraft)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("rejects and clears unparseable JSON", () => {
    sessionStorage.setItem(KEY, "{not json");
    expect(readDraft(KEY, isWebDraft)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("rejects a JSON null without throwing", () => {
    sessionStorage.setItem(KEY, "null");
    expect(readDraft(KEY, isWebDraft)).toBeNull();
  });

  it("clearDraft removes the key", () => {
    saveDraft(KEY, { serviceId: "svc-1", step: 1 });
    clearDraft(KEY);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe("resilience when storage throws", () => {
  it("saveDraft swallows the failure", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    });
    expect(() => saveDraft(KEY, { serviceId: "a", step: 1 })).not.toThrow();
  });

  it("readDraft returns null instead of throwing", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(readDraft(KEY, isWebDraft)).toBeNull();
  });
});

describe("isRecord", () => {
  it("accepts objects and rejects everything else", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("x")).toBe(false);
    expect(isRecord(3)).toBe(false);
  });
});

describe("lane isolation", () => {
  it("keeps the two lanes' drafts apart", () => {
    saveDraft("kg-draft-book-service-web", { serviceId: "a", step: 3 });
    saveDraft("kg-draft-book-service-phone", { serviceId: "a", pickedId: "p" });
    expect(readDraft("kg-draft-book-service-web", isWebDraft)).not.toBeNull();
    expect(store.size).toBe(2);
  });
});
