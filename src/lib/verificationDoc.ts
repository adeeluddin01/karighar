import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================
   CNIC photo and selfie upload, for provider verification.

   This is the avatar module's twin for the *private* bucket, and it exists
   because the two paths had drifted badly. `uploadAvatar` checks the MIME
   type, caps the size and writes to a deterministic key; the onboarding
   screen's inline `tryUpload` did none of those things and built its key as
   `${user.id}/${name}-${file.name}` — interpolating a filename the user
   controls into a storage path, with no size limit at all, on the one bucket
   holding identity documents.

   So: same shape as ./avatar, same validate-then-upload order, and the
   filename never travels. `accept="image/*"` on the input is a file-picker
   hint, not a check — it is trivially bypassed, and it was the only thing
   standing here before.

   The checks are still client-side and therefore advisory: `file.type` comes
   from the browser. The enforceable limits are the bucket's own
   allowed-MIME/size settings in the Supabase dashboard, which these numbers
   are meant to mirror.
   ============================================================ */

/** The private bucket from patch_v11. Never `avatars` — that one is public. */
export const VERIFICATION_BUCKET = "verification";

/**
 * Larger than the avatar cap: a CNIC has to stay legible enough for an admin
 * to read the number off it, and people photograph it with the whole card in
 * frame.
 */
export const VERIFICATION_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** What the file input should offer, kept next to the check that enforces it. */
export const VERIFICATION_ACCEPT = ALLOWED.join(",");

/** Which document a file is — also the basename it gets in the bucket. */
export type DocKind = "cnic-front" | "cnic-back" | "selfie";

/** Why the file can't be used, or null if it can. */
export function validateVerificationDoc(file: { type: string; size: number }): string | null {
  if (!ALLOWED.includes(file.type)) {
    return "Pick a JPG, PNG or WebP photo.";
  }
  if (file.size > VERIFICATION_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `That photo is ${mb}MB. Pick one under 5MB.`;
  }
  return null;
}

export function verificationExt(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Where a document lives: one object per kind per user, overwritten in place.
 *
 * Deterministic and built only from values we control. The user's filename is
 * deliberately absent — it is attacker-controlled text that would otherwise
 * end up in a storage key, and it bought nothing, since the folder is already
 * scoped to the uploader and the kind already names the file.
 */
export function verificationPath(userId: string, kind: DocKind, type: string): string {
  return `${userId}/${kind}.${verificationExt(type)}`;
}

export type DocUpload = { path: string; error: null } | { path: null; error: string };

/**
 * Validate, then upload, and hand back the storage path to record on the row.
 *
 * Returns the path rather than a URL because the bucket is private: the
 * column stores a key, and admins read it through a signed URL.
 */
export async function uploadVerificationDoc(
  supabase: SupabaseClient,
  userId: string,
  kind: DocKind,
  file: File
): Promise<DocUpload> {
  const bad = validateVerificationDoc(file);
  if (bad) return { path: null, error: bad };

  const path = verificationPath(userId, kind, file.type);
  const { error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    const missing = /bucket/i.test(error.message) && /not found|does not exist/i.test(error.message);
    return {
      path: null,
      error: missing
        ? "Document storage isn't set up yet. Run supabase/schema.sql (it creates the bucket)."
        : error.message,
    };
  }

  return { path, error: null };
}

/**
 * How long an admin's view of an ID document stays valid.
 *
 * Long enough to read a CNIC off the screen, short enough that a URL which
 * leaks via a screenshot, a chat paste or a browser history is worthless by
 * the time anyone else tries it. Reopening the record simply re-signs.
 */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * A short-lived URL for one private verification object, or null.
 *
 * The bucket is private, so a stored path is not fetchable on its own — this
 * is the read half that `uploadVerificationDoc` above always assumed existed.
 * Authorisation is the storage policy's job, not ours: `verif_read` admits
 * the owner and `is_admin()`, so a non-admin asking for someone else's
 * document simply gets null back.
 *
 * Never throws. A missing path, a deleted object and a refused request all
 * collapse to null so the caller renders "not uploaded" rather than breaking
 * the page over a document that was always optional.
 */
export async function signedVerificationUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  if (!path || !path.trim()) return null;
  try {
    const { data, error } = await supabase.storage
      .from(VERIFICATION_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    // Network failure, SDK shape change — the document is a nice-to-have on
    // this screen, never a reason to take the screen down.
    return null;
  }
}
