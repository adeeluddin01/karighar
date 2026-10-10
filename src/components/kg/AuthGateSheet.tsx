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
 * The one unavoidable exception is Google OAuth: Supabase redirects the whole
 * page away and back via /auth/callback. Callers must persist their own draft
 * (e.g. to sessionStorage) inside `onGoogleRedirect` and restore it when the
 * page remounts with `next` pointing back at itself.
 */
export function AuthGateSheet({
  onClose,
  onSuccess,
  onGoogleRedirect,
  title = "Sign in to continue",
  subtitle = "Your details are saved — sign in or create an account to finish.",
}: {
  onClose: () => void;
  onSuccess: () => void;
  /** Called right before the Google OAuth redirect fires. Return the path to land back on. */
  onGoogleRedirect: () => string;
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
          onGoogleRedirect={onGoogleRedirect}
          onDone={onSuccess}
        />
      </div>
    </div>
  );
}
