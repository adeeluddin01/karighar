"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import {
  CAPTURE_MAX_EDGE,
  CAPTURE_QUALITY,
  cameraErrorMessage,
  cameraSupported,
  captureFileName,
  fitWithin,
  type CameraFacing,
} from "@/lib/camera";

/* ============================================================
   Take an identity photo, live.

   Opens the camera, shows the frame, and hands back a File built from a
   single captured frame. Nothing here can read the filesystem — there is no
   file input, by design. See lib/camera.ts for why `capture="environment"`
   on an <input type="file"> was not enough.

   The stream is stopped on every exit path. A camera left running is both a
   battery drain and, on a phone, a lit indicator light long after the user
   thinks they are done — which reads as the app spying on them.
   ============================================================ */
export function CameraCapture({
  kind,
  title,
  hint,
  facing,
  onCapture,
  onClose,
}: {
  /** Document kind — names the file and nothing else. */
  kind: string;
  title: string;
  hint: string;
  facing: CameraFacing;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setReady(false);
    if (!cameraSupported()) {
      setError(cameraErrorMessage("NotFoundError", facing));
      return;
    }
    try {
      // `ideal` rather than `exact` on facingMode: a laptop has one camera
      // and `exact: "environment"` fails outright there, where `ideal`
      // quietly gives the only camera it has.
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {
          // Autoplay rejection is not fatal; the frame still arrives and
          // `onCanPlay` flips `ready`.
        });
      }
    } catch (e) {
      const name = e instanceof DOMException ? e.name : undefined;
      setError(cameraErrorMessage(name, facing));
      stop();
    }
  }, [facing, stop]);

  useEffect(() => {
    void (async () => {
      await start();
    })();
    return stop;
  }, [start, stop]);

  async function shoot() {
    const v = video.current;
    if (!v || busy) return;
    setBusy(true);
    try {
      const { width, height } = fitWithin(
        v.videoWidth,
        v.videoHeight,
        CAPTURE_MAX_EDGE
      );
      if (!width || !height) {
        setError("The camera hasn't produced a frame yet. Give it a moment and try again.");
        setBusy(false);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("This browser couldn't process the photo. Try a different one.");
        setBusy(false);
        return;
      }
      ctx.drawImage(v, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", CAPTURE_QUALITY)
      );
      if (!blob) {
        setError("Couldn't save that photo. Try again.");
        setBusy(false);
        return;
      }
      // image/jpeg matches the bucket's allowlist in lib/verificationDoc.
      onCapture(new File([blob], captureFileName(kind), { type: "image/jpeg" }));
      stop();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} subtitle={hint} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        {error ? (
          <>
            <p className="rounded-xl bg-destructive-light p-3 text-sm text-destructive">{error}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => void start()}>Try again</Button>
            </div>
          </>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-black">
              <video
                ref={video}
                playsInline
                muted
                onCanPlay={() => setReady(true)}
                className="block max-h-[60vh] w-full object-contain"
                // The front camera is mirrored so a selfie behaves like a
                // mirror; the rear one must not be, or the CNIC text reads
                // backwards.
                style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
              />
              {!ready && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-white">
                  Starting the camera…
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Photos for verification are taken here, not chosen from your gallery.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={shoot} disabled={!ready || busy} icon="camera">
                {busy ? "Saving…" : "Take photo"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * The thumbnail + "take photo" control the onboarding form shows per slot.
 *
 * Holds the preview URL and revokes it when it changes or unmounts — an
 * object URL leaks the whole blob until the document is discarded
 * otherwise, and a 1600px JPEG per retake adds up.
 */
export function CapturedDoc({
  label,
  file,
  onOpen,
  onClear,
}: {
  label: string;
  file: File | null;
  onOpen: () => void;
  onClear: () => void;
}) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // Revoke on change and on unmount. Without this each retake leaks a
  // 1600px JPEG for the lifetime of the document.
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 text-sm font-semibold">{label}</p>
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="max-h-40 w-full rounded-lg object-contain" />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="ghost" icon="camera" onClick={onOpen}>
              Retake
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear}>
              Remove
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="ghost" icon="camera" onClick={onOpen} className="w-full">
          Open camera
        </Button>
      )}
    </div>
  );
}
