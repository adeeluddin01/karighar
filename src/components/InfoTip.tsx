"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { clsx } from "@/lib/clsx";

/* ============================================================
   A small "what does this mean?" explainer.

   Written after an admin looked at the settlements screen and asked why
   "In payments" still read Rs 1,910 after settling Rs 1,000 — a fair
   question, because nothing on the page said that figure is the total ever
   BILLED rather than the amount outstanding. Several of these numbers are
   only obvious once someone explains them, and there was nowhere to put the
   explanation that did not clutter the screen for people who already knew.

   Click, not hover: half the traffic is on a phone, where hover does not
   exist and a `title` attribute never appears. Follows FilterDropdown's
   shape — a bottom sheet on small screens, an anchored popover on sm+ — so
   it behaves like the other transient surfaces in the app.
   ============================================================ */
export function InfoTip({
  label,
  children,
  className,
}: {
  /** What this explains, for screen readers: "About net earnings". */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Pointerdown rather than click: a click listener fires after the button's
    // own handler has already toggled it back open, so the panel would never
    // close by clicking away.
    function onAway(e: PointerEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onAway);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onAway);
    };
  }, [open]);

  return (
    <span ref={wrap} className={clsx("relative inline-block align-middle ms-1", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon name="info" size="sm" />
      </button>

      {open && (
        <>
          {/* Mobile only: a scrim, so the sheet reads as modal and a stray tap
              anywhere dismisses it. */}
          <span
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <span
            id={id}
            role="note"
            className="fixed inset-x-0 bottom-0 z-50 block rounded-t-3xl border border-border bg-card p-4 text-start text-sm font-normal leading-relaxed text-foreground shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:start-0 sm:top-full sm:mt-2 sm:w-64 sm:max-w-[min(16rem,calc(100vw-2rem))] sm:rounded-2xl sm:p-3"
          >
            <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border sm:hidden" />
            {children}
          </span>
        </>
      )}
    </span>
  );
}
