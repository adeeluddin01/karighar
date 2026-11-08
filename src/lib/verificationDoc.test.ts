import { describe, expect, it } from "vitest";
import {
  SIGNED_URL_TTL_SECONDS,
  signedVerificationUrl,
  VERIFICATION_ACCEPT,
  VERIFICATION_BUCKET,
  VERIFICATION_MAX_BYTES,
  validateVerificationDoc,
  verificationExt,
  verificationPath,
} from "./verificationDoc";

const USER = "11111111-2222-3333-4444-555555555555";

describe("validateVerificationDoc", () => {
  it("accepts the three formats a phone camera produces", () => {
    expect(validateVerificationDoc({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateVerificationDoc({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateVerificationDoc({ type: "image/webp", size: 1000 })).toBeNull();
  });

  // `accept="image/*"` used to be the only thing here, and it is a file-picker
  // hint rather than a check.
  it("rejects a type outside the allowlist", () => {
    expect(validateVerificationDoc({ type: "image/heic", size: 1000 })).toContain("JPG");
    expect(validateVerificationDoc({ type: "application/pdf", size: 1000 })).toContain("JPG");
    expect(validateVerificationDoc({ type: "", size: 1000 })).toContain("JPG");
  });

  it("allows a file at exactly the cap and rejects one byte more", () => {
    expect(
      validateVerificationDoc({ type: "image/jpeg", size: VERIFICATION_MAX_BYTES })
    ).toBeNull();
    expect(
      validateVerificationDoc({ type: "image/jpeg", size: VERIFICATION_MAX_BYTES + 1 })
    ).toContain("under 5MB");
  });

  it("names the actual size, so the message is actionable", () => {
    expect(validateVerificationDoc({ type: "image/jpeg", size: 8 * 1024 * 1024 })).toContain(
      "8.0MB"
    );
  });

  it("offers exactly the types it enforces", () => {
    expect(VERIFICATION_ACCEPT).toBe("image/jpeg,image/png,image/webp");
  });
});

describe("verificationPath", () => {
  it("is deterministic, so a re-upload replaces the old document", () => {
    expect(verificationPath(USER, "cnic-front", "image/jpeg")).toBe(`${USER}/cnic-front.jpg`);
    expect(verificationPath(USER, "selfie", "image/png")).toBe(`${USER}/selfie.png`);
    expect(verificationPath(USER, "cnic-back", "image/webp")).toBe(`${USER}/cnic-back.webp`);
  });

  it("scopes the object to the uploader's folder", () => {
    // The storage policies key on (storage.foldername(name))[1] = auth.uid().
    expect(verificationPath(USER, "selfie", "image/jpeg").split("/")[0]).toBe(USER);
  });

  // THE POINT OF THIS MODULE. The old inline uploader built the key as
  // `${user.id}/${name}-${file.name}`, interpolating a user-controlled
  // filename into a storage path on the bucket that holds identity documents.
  it("never includes the uploaded file's name", () => {
    const hostile = "../../etc/passwd%00.jpg";
    const path = verificationPath(USER, "cnic-front", "image/jpeg");
    expect(path).not.toContain(hostile);
    expect(path).not.toContain("..");
    expect(path.split("/")).toHaveLength(2);
  });

  it("falls back to jpg for an unexpected type", () => {
    expect(verificationExt("image/gif")).toBe("jpg");
  });
});

describe("bucket choice", () => {
  // Avatars are public; these are not. Mixing them up would publish
  // someone's CNIC.
  it("uses the private bucket", () => {
    expect(VERIFICATION_BUCKET).toBe("verification");
  });
});

/* ---------- the read side: signed URLs ---------- */

// A hand-rolled stand-in for the storage client, same idea as the Deps fake
// in notificationsStore.test.ts — no network, and it records what it was
// asked for so "didn't call storage at all" is assertable.
function fakeStorage(result: {
  data?: { signedUrl?: string } | null;
  error?: { message: string } | null;
  throws?: boolean;
}) {
  const calls: { path: string; expiresIn: number }[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            calls.push({ path, expiresIn });
            if (result.throws) throw new Error("network down");
            return { data: result.data ?? null, error: result.error ?? null };
          },
          bucket,
        };
      },
    },
  };
  // The helper only touches .storage; the cast keeps the test honest about
  // that rather than constructing a whole SupabaseClient.
  return { client: client as unknown as Parameters<typeof signedVerificationUrl>[0], calls };
}

describe("signedVerificationUrl", () => {
  it("returns the signed URL on success", async () => {
    const { client, calls } = fakeStorage({ data: { signedUrl: "https://x/signed?token=abc" } });
    await expect(signedVerificationUrl(client, "u1/cnic-front.jpg")).resolves.toBe(
      "https://x/signed?token=abc"
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("u1/cnic-front.jpg");
  });

  // An absent document is the ordinary case — both file inputs are optional
  // at onboarding, and cnic_back_url has no writer at all.
  it("returns null for an absent path without calling storage", async () => {
    for (const path of [null, undefined, "", "   "]) {
      const { client, calls } = fakeStorage({ data: { signedUrl: "nope" } });
      await expect(signedVerificationUrl(client, path)).resolves.toBeNull();
      expect(calls).toHaveLength(0);
    }
  });

  it("returns null when storage refuses, rather than throwing", async () => {
    const { client } = fakeStorage({ data: null, error: { message: "Object not found" } });
    await expect(signedVerificationUrl(client, "u1/selfie.jpg")).resolves.toBeNull();
  });

  it("returns null when the call throws outright", async () => {
    const { client } = fakeStorage({ throws: true });
    await expect(signedVerificationUrl(client, "u1/selfie.jpg")).resolves.toBeNull();
  });

  it("passes the TTL through, defaulting to the shared constant", async () => {
    const { client, calls } = fakeStorage({ data: { signedUrl: "u" } });
    await signedVerificationUrl(client, "u1/a.jpg");
    await signedVerificationUrl(client, "u1/a.jpg", 30);
    expect(calls.map((c) => c.expiresIn)).toEqual([SIGNED_URL_TTL_SECONDS, 30]);
  });

  // A signed URL is a bearer token for someone's identity documents and
  // carries no further authorisation check once minted. Guards against this
  // quietly becoming a week.
  it("keeps the default TTL short", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeGreaterThan(0);
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(600);
  });
});
