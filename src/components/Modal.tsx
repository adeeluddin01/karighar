"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { clsx } from "@/lib/clsx";

// Bottom-sheet on mobile, centered dialog on sm+ — the prototype's .overlay/.modal.
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  size,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: "lg";
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    // Match the prototype: focus the first field, but not on touch (avoids the keyboard jumping up).
    if (window.innerWidth > 640) {
      panel.current?.querySelector<HTMLElement>("input,textarea,select")?.focus();
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panel} role="dialog" aria-modal="true" className={clsx("modal", size)}>
        {(title || subtitle) && (
          <div className="mhead">
            <div>
              {title && <h3 className="text-xl font-bold tracking-tight">{title}</h3>}
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close">
              <Icon name="x" size="sm" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
