"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Chip, PageHeader, Pill, Spinner, Toggle } from "@/components/ui";
import { BRAND } from "@/lib/config";

const THEME_KEY = "karighar-theme";
type Theme = "light" | "dark" | "system";

// Lightweight local preferences (persisted in localStorage for the MVP).
function useLocalToggle(key: string, initial: boolean) {
  const [on, setOn] = useState(initial);
  useEffect(() => {
    const v = localStorage.getItem(key);
    if (v !== null) setOn(v === "1");
  }, [key]);
  function toggle() {
    setOn((prev) => {
      localStorage.setItem(key, prev ? "0" : "1");
      return !prev;
    });
  }
  return [on, toggle] as const;
}

// Theme lives on <html data-theme>, stamped before paint by the script in
// src/app/layout.tsx. We read it straight off the DOM rather than mirroring it
// into state, so there's no hydration mismatch and no setState-in-effect:
// useSyncExternalStore serves "system" for the prerendered HTML and re-reads
// the real value once hydrated.
const THEME_EVENT = "karighar:themechange";

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function getTheme(): Theme {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "dark" || v === "light" ? v : "system";
}

function getServerTheme(): Theme {
  return "system";
}

function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);

  const apply = useCallback((next: Theme) => {
    if (next === "system") {
      localStorage.removeItem(THEME_KEY);
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return [theme, apply] as const;
}

export default function SettingsPage() {
  const { user, loading } = useRequireAuth("/settings");
  const router = useRouter();
  const [notif, toggleNotif] = useLocalToggle("pref_notifications", true);
  const [urdu, toggleUrdu] = useLocalToggle("pref_urdu", false);
  const [theme, setTheme] = useTheme();
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function resetPassword() {
    if (!user?.email) return;
    await createClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/signin`,
    });
    setPwMsg("Password reset link sent to your email.");
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading || !user) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <PageHeader title="Settings" subtitle="Preferences, account and legal." />

      <Card>
        <h2 className="text-base font-bold">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a theme, or follow your device setting.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <Chip key={t} active={theme === t} onClick={() => setTheme(t)} className="capitalize">
              {t}
            </Chip>
          ))}
        </div>
      </Card>

      <Card padded={false} className="mt-4 overflow-hidden">
        <Row label="Push notifications" desc="Job updates & messages">
          <Toggle on={notif} onChange={toggleNotif} label="Push notifications" />
        </Row>
        <Row label="اردو (Urdu)" desc="Switch app language (coming soon)">
          <Toggle on={urdu} onChange={toggleUrdu} label="Urdu language" />
        </Row>
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-bold">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={resetPassword}>
          Change password
        </Button>
        {pwMsg && (
          <Pill tone="ok" icon="check" className="mt-3">
            {pwMsg}
          </Pill>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-bold">About &amp; legal</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {BRAND.name} · {BRAND.city} · v1 (MVP)
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/support" className="font-semibold text-primary">
            Help &amp; Support
          </Link>
          <Link href="/terms" className="font-semibold text-primary">
            Terms
          </Link>
          <Link href="/privacy" className="font-semibold text-primary">
            Privacy
          </Link>
        </div>
      </Card>

      <div className="mt-6">
        <Button variant="danger" icon="logout" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </AppShell>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border p-4 last:border-b-0">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
