"use client";

import { useSyncExternalStore } from "react";

/* ============================================================
   Phone lane vs. web lane.

   The `Karighar Redesign.html` app surface is a phone design: it only
   applies below `md` (768px), which is exactly where the web layout's
   sidebar appears. From `md` up, pages render the original AppShell
   layout they always had.

   Two ways to pick a lane, because the trade-off differs per page:

   - <Lanes>  renders both and hides one with CSS. First paint is correct
              with no JS, so it keeps the prerendered content of the static
              marketing pages intact for crawlers. Only safe when both
              trees are cheap — both of them mount.

   - <Switch> mounts one tree. Use it wherever a lane fetches, subscribes
              or redirects, so that work never happens twice.
   ============================================================ */

const PHONE = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * `true` on phones, `false` from `md` up, `null` until hydrated — the
 * server can't know the viewport, so the third state is unavoidable.
 * Treat `null` as "not yet known" rather than as a lane.
 */
export function useIsPhone(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE).matches,
    () => null
  );
}

/** Mounts exactly one lane. Nothing renders until the viewport is known. */
export function Switch({ phone, web }: { phone: React.ReactNode; web: React.ReactNode }) {
  const isPhone = useIsPhone();
  if (isPhone === null) return null;
  return <>{isPhone ? phone : web}</>;
}
