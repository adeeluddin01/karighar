"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/siteUrl";
import { useRequireAuth } from "@/lib/useUser";
import { useLanguage } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Chip, PageHeader, Pill, Spinner, Toggle } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { proEntry } from "@/components/nav";
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
  const { user, profile, providerStatus, loading } = useRequireAuth("/settings");
  const router = useRouter();
  const [notif, toggleNotif] = useLocalToggle("pref_notifications", true);
  // The Urdu toggle used to write "pref_urdu" and do nothing. It now drives
  // the app language (see src/lib/i18n.tsx); the old key is still honoured
  // once on first load for anyone who flipped it earlier.
  const { t, tPro, lang, setLang } = useLanguage();
  const [theme, setTheme] = useTheme();
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function resetPassword() {
    if (!user?.email) return;
    await createClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${siteUrl()}/signin/`,
    });
    setPwMsg(t("settings.resetLinkSent"));
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const pro = tPro(proEntry(profile?.role, providerStatus), providerStatus);

  if (loading || !user) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <Card>
        <h2 className="text-base font-bold">{t("settings.appearance")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.themeHint")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["light", "dark", "system"] as Theme[]).map((key) => (
            <Chip
              key={key}
              active={theme === key}
              onClick={() => setTheme(key)}
            >
              {key === "light"
                ? t("settings.themeLight")
                : key === "dark"
                  ? t("settings.themeDark")
                  : t("settings.themeSystem")}
            </Chip>
          ))}
        </div>
      </Card>

      <Card padded={false} className="mt-4 overflow-hidden">
        <Row label={t("settings.pushNotif")} desc={t("settings.pushNotifDesc")}>
          <Toggle on={notif} onChange={toggleNotif} label="Push notifications" />
        </Row>
        <Row label="اردو (Urdu)" desc={t("settings.languageDesc")}>
          <Toggle
            on={lang === "ur"}
            onChange={() => setLang(lang === "ur" ? "en" : "ur")}
            label="Urdu language"
          />
        </Row>
      </Card>

      <Card className="mt-4">
        <h2 className="text-base font-bold">{t("settings.account")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={resetPassword}>
          {t("settings.changePassword")}
        </Button>
        {pwMsg && (
          <Pill tone="ok" icon="check" className="mt-3">
            {pwMsg}
          </Pill>
        )}
      </Card>

      {pro && (
        <Card className="mt-4">
          <h2 className="text-base font-bold">{pro.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{pro.hint}</p>
          <Link href={pro.href} className="btn-ghost btn-sm mt-3 inline-flex">
            {pro.label}
            <Icon name="chevron" size="sm" />
          </Link>
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="text-base font-bold">{t("settings.aboutLegal")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {BRAND.name} · {BRAND.city} · v1 (MVP)
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/support" className="font-semibold text-primary">
            {t("settings.helpSupport")}
          </Link>
          <Link href="/terms" className="font-semibold text-primary">
            {t("settings.terms")}
          </Link>
          <Link href="/privacy" className="font-semibold text-primary">
            {t("settings.privacy")}
          </Link>
        </div>
      </Card>

      <div className="mt-6">
        <Button variant="danger" icon="logout" onClick={signOut}>
          {t("common.signOut")}
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
