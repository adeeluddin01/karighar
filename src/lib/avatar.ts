import type { SupabaseClient } from "@supabase/supabase-js";

/** The public bucket from patch_v23. Never `verification` — that one is private. */
export const AVATAR_BUCKET = "avatars";

/** Anything larger is a phone camera original; it would be slow on 3G. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/** What the file input should offer, kept next to the check that enforces it. */
export const AVATAR_ACCEPT = ALLOWED.join(",");

/**
 * Why the file can't be used, or null if it can.
 *
 * Returns a sentence to show the user rather than a code: these are the only
 * two ways an upload gets rejected before it starts, and both are things the
 * person can fix themselves.
 */
export function validateAvatar(file: { type: string; size: number }): string | null {
  if (!ALLOWED.includes(file.type)) {
    return "Pick a JPG, PNG or WebP image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `That image is ${mb}MB. Pick one under 2MB.`;
  }
  return null;
}

/** `jpeg` for a JPEG, and so on — the extension the bucket object gets. */
export function avatarExt(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Where a user's picture lives: one object per account, overwritten in place.
 *
 * Deterministic rather than timestamped so re-uploading replaces the old
 * picture instead of leaving every previous one behind in the bucket — there
 * is no cleanup job, and nothing else would ever delete them.
 */
export function avatarPath(userId: string, type: string): string {
  return `${userId}/avatar.${avatarExt(type)}`;
}

/**
 * Add a version marker to a public object URL.
 *
 * THIS IS THE BIT THAT MAKES A NEW PICTURE ACTUALLY APPEAR. Because
 * `avatarPath` is deterministic, re-uploading produces the same public URL,
 * and both the browser cache and Supabase's CDN keep serving the OLD bytes —
 * the upload succeeds, the database is right, and the user still sees their
 * previous face. Storing the URL with a changing `?v=` is what makes it a
 * different URL to every cache in the chain. Unknown query parameters are
 * ignored by storage itself.
 */
export function withCacheBust(url: string, version: number = Date.now()): string {
  if (!url) return url;
  const [base] = url.split("?");
  return `${base}?v=${version}`;
}

export type AvatarUpload = { url: string; error: null } | { url: null; error: string };

/**
 * Put the file in the bucket and hand back the URL to store on the profile.
 *
 * Does NOT write `profiles.avatar_url` itself — the caller does that, so the
 * two lanes can show their own toast and update their own local state
 * without this module knowing about either.
 */
export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<AvatarUpload> {
  const bad = validateAvatar(file);
  if (bad) return { url: null, error: bad };

  const path = avatarPath(userId, file.type);
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    // upsert, so the second picture replaces the first rather than failing
    // with "resource already exists".
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    // The most likely cause on a database that hasn't run patch_v23, and the
    // one error message that would otherwise be baffling.
    const missing = /bucket/i.test(error.message) && /not found|does not exist/i.test(error.message);
    return {
      url: null,
      error: missing
        ? "Picture storage isn't set up yet. Run supabase/patch_v23_avatars.sql."
        : error.message,
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  return { url: withCacheBust(publicUrl), error: null };
}
