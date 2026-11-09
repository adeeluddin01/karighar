/* ============================================================
   Live camera capture for identity documents.

   Verification photos are taken in the app, never chosen from the gallery.
   That is a fraud control, not a UI preference: a file picker lets someone
   upload a photo of a CNIC that is not theirs, and a selfie that is not of
   them. A live frame is at least taken on the spot.

   `<input type="file" capture="environment">` is NOT enough for this. The
   attribute is a HINT — mobile browsers usually honour it, desktop ignores
   it entirely and shows a file picker, and even on mobile several versions
   still offer a gallery option. Anything that falls back to the filesystem
   defeats the point, so the capture goes through getUserMedia instead and
   the file input is gone.

   Pure helpers live here so the arithmetic and the error copy can be
   tested; the camera itself is in components/CameraCapture.tsx, which
   vitest (node env, *.test.ts only) cannot mount.
   ============================================================ */

/** Rear camera for a document, front camera for a face. */
export type CameraFacing = "environment" | "user";

/**
 * What to show when the camera cannot be opened.
 *
 * Takes the DOMException name rather than the exception, so the caller does
 * not have to care what shape the browser threw. Mirrors
 * geolocationErrorMessage(): a sentence the person can act on, not a code.
 */
export function cameraErrorMessage(name: string | undefined, facing: CameraFacing): string {
  const subject = facing === "user" ? "selfie" : "photo";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera permission was denied. Allow camera access in your browser settings, then try again — we can't accept a photo from your gallery for verification.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera found on this device. Verification photos have to be taken live, so please finish this step on a phone.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your camera is already in use by another app. Close it and try again.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      // Asking for a specific facing mode on a device that has only one.
      return `Couldn't open the right camera for the ${subject}. Try again, or use a different device.`;
    case "SecurityError":
      return "The camera is blocked on an insecure connection. Open the site over https and try again.";
    case "AbortError":
      return "The camera stopped unexpectedly. Try again.";
    default:
      return `Couldn't open the camera for the ${subject}. Check that no other app is using it, then try again.`;
  }
}

/** True when this browser can capture at all. */
export function cameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * Scale (w, h) down to fit inside `max` on its longest side.
 *
 * A modern phone sensor hands back frames far larger than anyone needs to
 * read a CNIC number, and the bucket caps an upload at 5MB. Scaling before
 * encoding is what keeps a capture comfortably under it without dropping
 * JPEG quality so far that the number stops being legible.
 *
 * Never scales UP: a small frame stays its own size rather than being
 * stretched into a bigger, blurrier file.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / longest;
  // At least 1px on the short side, or a very wide frame rounds to zero and
  // canvas throws.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Longest edge of a stored capture, in pixels. */
export const CAPTURE_MAX_EDGE = 1600;

/** JPEG quality for a capture — legible text, small file. */
export const CAPTURE_QUALITY = 0.85;

/**
 * The filename a capture carries.
 *
 * Only ever cosmetic: `verificationPath()` builds the storage key from the
 * user id and the document kind, and deliberately ignores the filename. It
 * still wants to be meaningful if anyone looks at the blob in a debugger.
 */
export function captureFileName(kind: string): string {
  return `${kind}.jpg`;
}
