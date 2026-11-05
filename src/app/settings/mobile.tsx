"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/siteUrl";
import { useRequireAuth } from "@/lib/useUser";
import { useToast } from "@/components/Toast";
import { Screen, Scroll, TopBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Pill, Skel, Well } from "@/components/kg/parts";
import { proEntry } from "@/components/nav";
import { useLanguage } from "@/lib/i18n";
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

// Labels come from the dictionary at render time, so Urdu mode translates them.
const THEMES: { key: Theme }[] = [{ key: "light" }, { key: "dark" }, { key: "system" }];

export default function SettingsScreen() {
  const { user, profile, providerStatus, loading } = useRequireAuth("/settings");
  const router = useRouter();
  const toast = useToast();
  const [notif, setNotif] = useLocalToggle("pref_notifications", true);
  // Was a dead toggle writing "pref_urdu" — now drives the app language
  // (see src/lib/i18n.tsx); the old key is honoured once on first load.
  const { t, tPro, lang, setLang } = useLanguage();
  const [theme, setTheme] = useTheme();
  const [busy, setBusy] = useState(false);

  async function resetPassword() {
    if (!user?.email) return;
    setBusy(true);
    const { error } = await createClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${siteUrl()}/signin/`,
    });
    setBusy(false);
    toast(
      error ? error.message : t("settings.resetLinkSent"),
      error ? "error" : "success"
    );
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const pro = tPro(proEntry(profile?.role, providerStatus), providerStatus);

  if (loading || !user) {
    return (
      <Screen>
        <TopBar title={t("settings.title")} back="/profile" />
        <Scroll underTop pad="plain">
          <Skel h={100} />
          <Skel h={140} />
        </Scroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title={t("settings.title")} back="/profile" />
      <Scroll underTop pad="plain">
        <h3 className="lbl">{t("settings.appearance")}</h3>
        <div className="chips" role="radiogroup" aria-label="Theme">
          {THEMES.map((th) => (
            <button
              key={th.key}
              type="button"
              role="radio"
              aria-checked={theme === th.key}
              className={clsx("chip", theme === th.key && "sel")}
              onClick={() => setTheme(th.key)}
            >
              <KIcon name={th.key === "dark" ? "moon" : th.key === "light" ? "spark" : "globe"} xs />
              {th.key === "light"
                ? t("settings.themeLight")
                : th.key === "dark"
                  ? t("settings.themeDark")
                  : t("settings.themeSystem")}
            </button>
          ))}
        </div>

        <h3 className="lbl">{t("settings.preferences")}</h3>
        <div className="menu card">
          <label htmlFor="kg-pref-notif">
            <Well icon="bell" size="sm" />
            <div>
              <b>{t("settings.pushNotif")}</b>
              <small>{t("settings.pushNotifDesc")}</small>
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
              <small>{t("settings.languageDesc")}</small>
            </div>
            <input
              className="sw-in"
              type="checkbox"
              id="kg-pref-urdu"
              checked={lang === "ur"}
              onChange={(e) => setLang(e.target.checked ? "ur" : "en")}
            />
          </label>
        </div>

        {pro && (
          <>
            <h3 className="lbl">{t("settings.workWithUs")}</h3>
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

        <h3 className="lbl">{t("settings.account")}</h3>
        <div className="menu card">
          <div>
            <Well icon="mail" size="sm" />
            <div>
              <b>{t("settings.email")}</b>
              <small>{user.email}</small>
            </div>
          </div>
          <button type="button" onClick={resetPassword} disabled={busy}>
            <Well icon="lock" size="sm" />
            <div>
              <b>{t("settings.changePassword")}</b>
              <small>{t("settings.resetLinkHint")}</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </button>
          <button type="button" className="bad" onClick={signOut}>
            <Well icon="logout" size="sm" />
            <div>
              <b>{t("settings.logOut")}</b>
            </div>
          </button>
        </div>

        <h3 className="lbl">{t("settings.about")}</h3>
        <div className="menu card">
          <Link href="/support">
            <Well icon="headset" size="sm" />
            <div>
              <b>{t("settings.helpSupport")}</b>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/terms">
            <Well icon="doc" size="sm" />
            <div>
              <b>{t("settings.termsOfService")}</b>
            </div>
            <KIcon name="chev-r" className="chev" />
          </Link>
          <Link href="/privacy">
            <Well icon="shield" size="sm" />
            <div>
              <b>{t("settings.privacyPolicy")}</b>
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
