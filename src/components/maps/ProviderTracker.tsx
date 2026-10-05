"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Provider-side: shares live GPS location to job_tracking so the customer can follow.
export function ProviderTracker({ jobId, autoStart }: { jobId: string; autoStart: boolean }) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (autoStart) start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  function start() {
    if (!navigator.geolocation) {
      setError("Location not supported on this device.");
      return;
    }
    setError(null);
    setSharing(true);
    const supabase = createClient();
    watchId.current = navigator.geolocation.watchPosition(
      async (p) => {
        await supabase.from("job_tracking").upsert(
          {
            job_id: jobId,
            provider_lat: p.coords.latitude,
            provider_lng: p.coords.longitude,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_id" }
        );
      },
      () => setError("Couldn't access location. Enable GPS/location permission."),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  function stop() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setSharing(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          {sharing ? <><span className="live" /> Sharing your live location</> : "Location sharing off"}
        </p>
        {error && <p className="errtxt">{error}</p>}
        {!error && <p className="text-xs text-muted-foreground">Lets the customer see you approaching.</p>}
      </div>
      <button
        onClick={sharing ? stop : start}
        className={sharing ? "btn-ghost btn-sm" : "btn-primary btn-sm"}
      >
        {sharing ? "Stop" : "Share location"}
      </button>
    </div>
  );
}
