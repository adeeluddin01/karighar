"use client";

import { useEffect, useState } from "react";
import { KAuthForm } from "@/components/kg/AuthForm";
import { KIcon } from "@/components/kg/icons";
import { clsx } from "@/lib/clsx";

type Mode = "signin" | "signup";

/**
 * Sign-in/sign-up gate shown in place, without navigating away — so a filled
 * form (booking screen, custom job, etc.) stays intact behind the sheet.
 *
 * Two flows unavoidably leave the page anyway — Google OAuth, and an email
 * signup that has to be confirmed — and both come back via /auth/callback.
 * Callers must persist their own draft (e.g. to sessionStorage) inside
 * `onLeaveForAuth` and restore it when the page remounts with `next` pointing
 * back at itself.
 */
export function AuthGateSheet({
  onClose,
  onSuccess,
  onLeaveForAuth,
  title = "Sign in to continue",
  subtitle = "Your details are saved — sign in or create an account to finish.",
}: {
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Called before any flow that navigates away (OAuth, or an email signup
   * awaiting confirmation). Return the path to land back on; stash any draft
   * here.
   */
  onLeaveForAuth: () => string;
  title?: string;
  subtitle?: string;
}) {
  const [mode, setMode] = useState<Mode>("signin");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="over"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="over-card" role="dialog" aria-modal="true" aria-label={title}>
        <span className="grab" />
        <div className="sh-head">
          <div>
            <h2 style={{ fontSize: 19 }}>{title}</h2>
            <small>{subtitle}</small>
          </div>
          <button type="button" className="ic sm" onClick={onClose} aria-label="Close">
            <KIcon name="x" />
          </button>
        </div>

        <div className="seg kg-self-center" role="tablist" aria-label="Sign in or sign up">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={clsx(mode === "signin" && "sel")}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={clsx(mode === "signup" && "sel")}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
        </div>

        <KAuthForm
          mode={mode}
          submitLabel={mode === "signup" ? "Create account & continue" : "Sign in & continue"}
          onLeaveForAuth={onLeaveForAuth}
          onDone={onSuccess}
        />
      </div>
    </div>
  );
}
