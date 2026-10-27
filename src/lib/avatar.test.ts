import { describe, it, expect } from "vitest";
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_BYTES,
  avatarExt,
  avatarPath,
  validateAvatar,
  withCacheBust,
} from "./avatar";

describe("validateAvatar", () => {
  it("accepts the three formats the input offers", () => {
    for (const type of AVATAR_ACCEPT.split(",")) {
      expect(validateAvatar({ type, size: 1000 }), type).toBeNull();
    }
  });

  it("rejects a non-image, and says what to pick instead", () => {
    const msg = validateAvatar({ type: "application/pdf", size: 1000 });
    expect(msg).toMatch(/JPG, PNG or WebP/);
  });

  // HEIC is what an iPhone produces by default and the browser cannot decode
  // it, so a silently-accepted upload would store a picture nothing renders.
  it("rejects HEIC rather than storing something no browser can show", () => {
    expect(validateAvatar({ type: "image/heic", size: 1000 })).toBeTruthy();
  });

  it("rejects an oversized file and names the actual size", () => {
    const msg = validateAvatar({ type: "image/jpeg", size: 5 * 1024 * 1024 });
    expect(msg).toContain("5.0MB");
    expect(msg).toContain("under 2MB");
  });

  it("allows a file exactly on the limit", () => {
    expect(validateAvatar({ type: "image/jpeg", size: AVATAR_MAX_BYTES })).toBeNull();
    expect(validateAvatar({ type: "image/jpeg", size: AVATAR_MAX_BYTES + 1 })).toBeTruthy();
  });
});

describe("avatarPath", () => {
  it("puts the object in the user's own folder, which is what RLS checks", () => {
    // avatars_own_write requires (storage.foldername(name))[1] = auth.uid()
    expect(avatarPath("abc-123", "image/jpeg").split("/")[0]).toBe("abc-123");
  });

  it("is deterministic, so a re-upload replaces rather than accumulates", () => {
    expect(avatarPath("u1", "image/png")).toBe(avatarPath("u1", "image/png"));
  });

  it("carries the right extension for each accepted type", () => {
    expect(avatarExt("image/png")).toBe("png");
    expect(avatarExt("image/webp")).toBe("webp");
    expect(avatarExt("image/jpeg")).toBe("jpg");
  });
});

/* The whole reason a new picture shows up at all. `avatarPath` is
   deterministic, so the public URL never changes on its own and every cache
   between the bucket and the screen keeps serving the previous image. */
describe("withCacheBust", () => {
  it("makes a re-upload a different URL", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar.jpg";
    expect(withCacheBust(url, 1)).not.toBe(withCacheBust(url, 2));
  });

  it("replaces an existing version rather than stacking them up", () => {
    const once = withCacheBust("https://x/a.jpg", 1);
    const twice = withCacheBust(once, 2);
    expect(twice).toBe("https://x/a.jpg?v=2");
    expect(twice.match(/\?/g)).toHaveLength(1);
  });

  it("leaves the object path itself untouched", () => {
    expect(withCacheBust("https://x/a.jpg", 7).split("?")[0]).toBe("https://x/a.jpg");
  });

  it("passes an empty url straight through", () => {
    expect(withCacheBust("")).toBe("");
  });
});
