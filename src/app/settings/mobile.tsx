"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { useToast } from "@/components/Toast";
import { Screen, Scroll, TopBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Pill, Skel, Well } from "@/components/kg/parts";
import { proEntry } from "@/components/nav";
import { useTheme, type Theme } from "@/lib/theme";
import { BRAND } from "@/lib/config";
import { clsx } from "@/lib/clsx";

// Lightweight local preferences (persisted in localStorage for the MVP).
function useLocalToggle(key: string, initial: boolean) {
  const [on, setOn] = useState(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) setOn(v === "1");
    } catch {
      // ignore
    }
  }, [key]);
  function toggle(next: boolean) {
    setOn(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // ignore
    }
  }
  return [on, toggle] as const;
}

const THEMES: { key: Theme; label: string }[] = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System" },
];

export default function SettingsScreen() {
  const { user, profile, providerStatus, loading } = useRequireAuth("/settings");
  const router = useRouter();
  const toast = useToast();
  const [notif, setNotif] = useLocalToggle("pref_notifications", true);
  const [urdu, setUrdu] = useLocalToggle("pref_urdu", false);
  const [theme, setTheme] = useTheme();
  const [busy, setBusy] = useState(false);

  async function resetPassword() {
    if (!user?.email) return;
    setBusy(true);
    const { error } = await createClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/signin`,
    });
    setBusy(false);
    toast(
      error ? error.message : "Password reset link sent to your email.",
      error ? "error" : "success"
    );
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const pro = proEntry(profile?.role, providerStatus);

  if (loading || !user) {
    return (
      <Screen>
        <TopBar title="Settings" back="/profile" />
        <Scroll underTop pad="plain">
          <Skel h={100} />
          <Skel h={140} />
        </Scroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Settings" back="/profile" />
      <Scroll underTop pad="plain">
        <h3 className="lbl">Appearance</h3>
        <div className="chips" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={theme === t.key}
              className={clsx("chip", theme === t.key && "sel")}
              onClick={() => setTheme(t.key)}
            >
              <KIcon name={t.key === "dark" ? "moon" : t.key === "light" ? "spark" : "globe"} xs />
              {t.label}
            </button>
          ))}
        </div>

        <h3 className="lbl">Preferences</h3>
        <div className="menu card">
          <label htmlFor="kg-pref-notif">
            <Well icon="bell" size="sm" />
            <div>
              <b>Push notifications</b>
              <small>Job updates and messages</small>
            </div>
            <input
              className="sw-in"
              type="checkbox"
              id="kg-pref-notif"
              checked={notif}
              onChange={(e) => setNotif(e.target.checked)}
            />
          </label>
          <label htmlFor="kg-pref-urdu">
            <Well icon="globe" size="sm" />
            <div>
              <b>اردو (Urdu)</b>
              <small>App language · coming soon</small>
            </div>
            <input
              className="sw-in"
              type="checkbox"
              id="kg-pref-urdu"
              checked={urdu}
              onChange={(e) => setUrdu(e.target.checked)}
            />
          </label>
        </div>

        {pro && (
          <>
            <h3 className="lbl">Work with us</h3>
            <div className="menu card">
              <Link href={pro.href}>
                <Well icon="wrench" size="sm" />
                <div>
                  <b>{pro.label}</b>
                  <small>{pro.hint}</small>
                </div>
                <KIcon name="chev-r" className="chev" />
              </Link>
            </div>
          </>
        )}

        <h3 className="lbl">Account</h3>
        <div className="menu card">
          <div>
            <Well icon="mail" size="sm" />
            <div>
              <b>Email</b>
              <small>{user.email}</small>
            </div>
          </div>
          <button type="button" onClick={resetPassword} disabled={busy}>
            <Well icon="lock" size="sm" />
            <div>
              <b>Change password</b>
              <small>We&rsquo;ll email you a reset link</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </button>
          <button type="button" className="bad" onClick={signOut}>
            <Well icon="logout" size="sm" />
            <div>
              <b>Log out</b>
            </div>
          </button>
        </div>

        <h3 className="lbl">About</h3>
        <div className="menu card">
          <Link href="/support">
            <Well icon="headset" size="sm" />
            <div>
              <b>Help &amp; support</b>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/terms">
            <Well icon="doc" size="sm" />
            <div>
              <b>Terms of service</b>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/privacy">
            <Well icon="shield" size="sm" />
            <div>
              <b>Privacy policy</b>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
        </div>

        <Pill className="kg-self-center">
          {BRAND.name} · {BRAND.city} · v1
        </Pill>
      </Scroll>
    </Screen>
  );
}
