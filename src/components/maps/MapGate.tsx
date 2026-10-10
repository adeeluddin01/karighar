"use client";

import { APILoadingStatus, useApiLoadingStatus } from "@vis.gl/react-google-maps";

// Renders a friendly fallback instead of a broken grey map when the Google
// Maps API fails to load (e.g. billing not enabled, key restricted, quota).
// `fallback` lets a caller substitute its own stand-in — the redesigned
// screens pass the illustrated <MapArt>, so they still read as designed.
export function MapGate({
  children,
  compact,
  fallback,
}: {
  children: React.ReactNode;
  compact?: boolean;
  fallback?: React.ReactNode;
}) {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div
        className={`flex ${compact ? "h-32" : "h-full"} w-full flex-col items-center justify-center gap-1 rounded-xl border border-border bg-secondary p-4 text-center`}
      >
        <span className="text-2xl">🗺️</span>
        <p className="text-sm font-medium text-foreground">Map preview unavailable</p>
        <p className="text-xs text-muted-foreground">
          Enable billing for the Google Maps key. Location can still be set by address.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
