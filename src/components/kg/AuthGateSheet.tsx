"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizePkPhone } from "@/lib/validate";
import { Modal } from "@/components/Modal";
import { Button, Field, Input, Tabs } from "@/components/ui";

type Mode = "signin" | "signup";

/**
 * Sign-in/sign-up gate shown in place, without navigating away — so a filled
 * form (booking wizard, custom job, etc.) stays intact behind the modal.
 *
 * The one unavoidable exception is Google OAuth: Supabase redirects the whole
 * page away and back via /auth/callback. Callers must persist their own draft
 * (e.g. to sessionStorage) inside `onGoogleRedirect` and restore it when the
 * page remounts with `next` pointing back at itself.
 */
export function AuthGateModal({
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
        setNotice(
          "Account created. Check your email to confirm it, then sign in here to continue."
        );
        setBusy(false);
        return;
      }
      await supabase
        .from("profiles")
        .update({ full_name: fullName, phone: normPhone, role: "customer" })
        .eq("id", data.session.user.id);
      setBusy(false);
      onSuccess();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      setBusy(false);
      onSuccess();
    }
  }

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <Tabs
        value={mode}
        onChange={setMode}
        className="mb-5 w-full justify-center"
        tabs={[
          { key: "signin", label: "Sign in" },
          { key: "signup", label: "Sign up" },
        ]}
      />

      <button
        type="button"
        onClick={google}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-secondary"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
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
        Continue with Google
      </button>

      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or {mode === "signup" ? "sign up" : "sign in"}{" "}
        with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <>
            <Field label="Full name">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Ahmed Khan"
              />
            </Field>
            <Field label="Phone number" hint="We use this to coordinate your service.">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="03XX-XXXXXXX"
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
          </>
        )}
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@email.com"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="At least 6 characters"
          />
        </Field>

        {error && <p className="errtxt">{error}</p>}
        {notice && (
          <p className="rounded-xl bg-warning-light p-3 text-sm text-warning-foreground">
            {notice}
          </p>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Please wait…" : mode === "signup" ? "Create account & continue" : "Sign in & continue"}
        </Button>
      </form>
    </Modal>
  );
}
