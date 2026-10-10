"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizePkPhone } from "@/lib/validate";
import { KIcon } from "@/components/kg/icons";

/**
 * The email/password + Google form, in the redesign's control vocabulary.
 *
 * Shared by the full-page `/signin` and `/signup` screens and by
 * `<AuthGateSheet>`, which shows the same thing in place so a half-filled
 * booking form survives behind it.
 */
export function KAuthForm({
  mode,
  asProvider,
  submitLabel,
  onGoogleRedirect,
  onDone,
}: {
  mode: "signin" | "signup";
  /** Sign-ups that should land in the pro application instead. */
  asProvider?: boolean;
  submitLabel?: string;
  /** Called right before the OAuth redirect; returns the path to land back on. */
  onGoogleRedirect: () => string;
  /** A session now exists. */
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function google() {
    setError(null);
    const next = onGoogleRedirect();
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setError(error.message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    if (mode === "signup") {
      const normPhone = normalizePkPhone(phone);
      if (!normPhone) {
        setError("Enter a valid Pakistani mobile number, e.g. 0300 1234567");
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone: normPhone } },
      });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      if (!data.session) {
        setNotice("Account created. Check your email to confirm it, then sign in here.");
        setBusy(false);
        return;
      }
      // Signed in immediately — persist name/phone + role.
      await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: normPhone,
          role: asProvider ? "provider" : "customer",
        })
        .eq("id", data.session.user.id);
      setBusy(false);
      onDone();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone();
  }

  return (
    <>
      <button type="button" className="btn ghost wide" onClick={google}>
        <GoogleMark />
        Continue with Google
      </button>

      <div className="kg-or">or {mode === "signup" ? "sign up" : "sign in"} with email</div>

      <form
        onSubmit={submit}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        {mode === "signup" && (
          <>
            <label className="in flat">
              <KIcon name="user" />
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Full name"
                aria-label="Full name"
              />
            </label>
            <label className="in flat">
              <KIcon name="phone" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="03XX-XXXXXXX"
                inputMode="tel"
                autoComplete="tel"
                aria-label="Phone number"
              />
            </label>
          </>
        )}
        <label className="in flat">
          <KIcon name="mail" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@email.com"
            aria-label="Email"
          />
        </label>
        <label className="in flat">
          <KIcon name="lock" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="At least 6 characters"
            aria-label="Password"
          />
        </label>

        {error && (
          <div className="note bad">
            <KIcon name="alert" />
            <p>{error}</p>
          </div>
        )}
        {notice && (
          <div className="note warn">
            <KIcon name="mail" />
            <p>{notice}</p>
          </div>
        )}

        <button type="submit" className="btn wide" disabled={busy}>
          {busy ? "Please wait…" : submitLabel ?? (mode === "signup" ? "Create account" : "Sign in")}
        </button>
      </form>
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden style={{ flex: "none" }}>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 16 3 9.1 7.6 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 36 26.7 37 24 37c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9 40.3 15.9 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4 5.5l6.3 5.3C41 36.3 44 30.8 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
